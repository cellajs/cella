import { setTimeout as sleep } from 'node:timers/promises';
import { sql } from 'drizzle-orm';
import { PgoutputPlugin } from 'pg-logical-replication';
import { CDC_PUBLICATION_NAME, CDC_SLOT_NAME } from '../../constants';
import { cdcDb } from '../../lib/db';
import { wsClient } from '../../network/websocket-client';
import { ensureReplicationSlot, subscribeWithReconnect } from '../../pipeline/replication';
import { stopCdcWorker } from '../../pipeline/worker';
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
  const res = await cdcDb.execute<{ active: boolean }>(sql`SELECT active FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`);
  return res.rows[0]?.active ?? false;
}

export interface CdcPipelineHarness {
  /** Ends the worker's subscription loop as its shutdown does, and leaves the slot where it is. */
  stopReading(): Promise<void>;
  /** Starts the loop again on the same slot, as a worker that starts does, and waits until it reads. */
  readAgain(): Promise<void>;
  /** Stops the worker for good: the loop, the socket to the API, and the slot. */
  stop(): Promise<void>;
}

/**
 * Starts the worker's real subscription loop in this process, on a slot made at the current position, and waits until
 * it reads. The loop checks the setup and settles the lost cases as in production, so a test arranges its database
 * first: counters that are empty on a database with a history are rebuilt. A downstream WebSocket server must already
 * be listening. Import after runtime environment setup because CDC modules parse configuration at load time.
 */
export async function startCdcPipeline(): Promise<CdcPipelineHarness> {
  // Drop a leftover slot from a previous run; bail if one is actively held.
  const existing = await cdcDb.execute<{ active: boolean }>(sql`SELECT active FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`);
  if (existing.rows[0]?.active) {
    throw new Error(`Replication slot '${CDC_SLOT_NAME}' is already active: another worker is using the test DB`);
  }
  if (existing.rows.length) {
    await cdcDb.execute(sql`SELECT pg_drop_replication_slot(${CDC_SLOT_NAME})`);
  }

  // Made here, so the loop finds it: a slot the loop makes on a database with a history is a lost case.
  await ensureReplicationSlot();

  const plugin = new PgoutputPlugin({ protoVersion: 1, publicationNames: [CDC_PUBLICATION_NAME], messages: true });
  let looping = false;

  const readAgain = async () => {
    replicationState.stopping = false;
    looping = true;
    void subscribeWithReconnect(plugin).finally(() => {
      looping = false;
    });
    await waitFor(() => replicationState.subscribed && slotActive(), 15_000, 'replication slot active');
  };

  /** Resolves once the loop has ended and Postgres shows the slot as free. */
  const loopEnded = async () => {
    // The loop ends with its subscription, or after the wait it is in: at most the longest wait before a read.
    await waitFor(() => !looping, 35_000, 'the subscription loop ended');
    await waitFor(async () => !(await slotActive()), 10_000, `replication slot '${CDC_SLOT_NAME}' released`);
  };

  const stopReading = async () => {
    replicationState.stopping = true;
    await replicationState.service?.stop().catch(() => {});
    await loopEnded();
  };

  wsClient.connect();
  await waitFor(() => wsClient.isConnected(), 15_000, 'CDC worker websocket connected');
  await readAgain();

  return {
    stopReading,
    readAgain,
    async stop() {
      // The worker's own shutdown: what is pending is recorded while the API can take it, then the socket and the loop end.
      await stopCdcWorker().catch(() => {});
      await loopEnded().catch(() => {});
      await cdcDb
        .execute(
          sql`SELECT pg_drop_replication_slot(${CDC_SLOT_NAME})
              WHERE EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME})`,
        )
        .catch(() => {});
    },
  };
}
