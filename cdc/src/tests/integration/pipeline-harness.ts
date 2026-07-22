import { setTimeout as sleep } from 'node:timers/promises';
import { sql } from 'drizzle-orm';
import { PgoutputPlugin } from 'pg-logical-replication';

import { CDC_PUBLICATION_NAME, CDC_SLOT_NAME } from '../../constants';
import { cdcDb } from '../../lib/db';
import { drainBuffers } from '../../pipeline/handle-message';
import { createReplicationService, ensureReplicationSlot, setupBackpressure } from '../../pipeline/replication';
import { wsClient } from '../../network/websocket-client';
import { replicationState } from '../../services/replication-state';

/** Poll a predicate until it holds or the deadline passes. */
export async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs: number, label: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(50);
  }
  throw new Error(`Timeout waiting for: ${label}`);
}

/** Whether the CDC replication slot is currently held by a connection. */
export async function slotActive(): Promise<boolean> {
  const res = await cdcDb.execute<{ active: boolean }>(
    sql`SELECT active FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`,
  );
  return res.rows[0]?.active ?? false;
}

export interface CdcPipelineHarness {
  stop(): Promise<void>;
}

/**
 * Starts the in-process CDC pipeline without the reconnect loop and waits for streaming.
 * A downstream WebSocket server must already be listening. Import after runtime environment
 * setup because CDC modules parse configuration at load time.
 */
export async function startCdcPipeline(): Promise<CdcPipelineHarness> {
  // Drop a leftover slot from a previous run; bail if one is actively held.
  const existing = await cdcDb.execute<{ active: boolean }>(
    sql`SELECT active FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`,
  );
  if (existing.rows[0]?.active) {
    throw new Error(`Replication slot '${CDC_SLOT_NAME}' is already active — another worker is using the test DB`);
  }
  if (existing.rows.length) {
    await cdcDb.execute(sql`SELECT pg_drop_replication_slot(${CDC_SLOT_NAME})`);
  }

  await ensureReplicationSlot();

  const service = createReplicationService();
  replicationState.service = service;
  setupBackpressure();
  wsClient.connect();
  replicationState.status = 'active';

  const plugin = new PgoutputPlugin({ protoVersion: 1, publicationNames: [CDC_PUBLICATION_NAME] });
  // subscribe() stays pending while streaming; it resolves on service.stop().
  service.subscribe(plugin, CDC_SLOT_NAME).catch(() => {});

  await waitFor(() => wsClient.isConnected(), 15_000, 'CDC worker websocket connected');
  await waitFor(() => slotActive(), 15_000, 'replication slot active');

  return {
    async stop() {
      wsClient.close();
      await service.stop().catch(() => {});
      await drainBuffers().catch(() => {});
      // service.stop() releases the active flag; wait for it before dropping.
      await waitFor(async () => !(await slotActive()), 10_000, `replication slot '${CDC_SLOT_NAME}' released`).catch(() => {});
      await cdcDb
        .execute(
          sql`SELECT pg_drop_replication_slot(${CDC_SLOT_NAME})
              WHERE EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME})`,
        )
        .catch(() => {});
    },
  };
}
