/**
 * CDC backpressure integration test (real logical replication).
 *
 * Exercises the core durability contract implemented by `setupBackpressure`
 * ([replication.ts](../../pipeline/replication.ts)): while the downstream
 * WebSocket is down the worker stops acknowledging the replication slot, so
 * Postgres retains WAL (no data loss); when the WebSocket returns, acks resume
 * and the slot advances again.
 *
 * Unlike the unit suites (which mock `replicationState`), this drives the real
 * pipeline against a logical-replication-capable Postgres and a stub WS server
 * standing in for the backend's `/internal/cdc` endpoint.
 *
 * Requirements (otherwise the whole suite is skipped):
 * - `DATABASE_CDC_URL` reachable with `wal_level = logical`
 * - the `cdc_pub` publication present (created by migrations)
 * - not running in `core` test mode
 *
 * Env (`DATABASE_CDC_URL`, `CDC_SECRET`, `API_WS_URL`) is provided by
 * [vitest.config.ts](../../../vitest.config.ts).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { sql } from 'drizzle-orm';
import { PgoutputPlugin } from 'pg-logical-replication';
import { nanoidTenant } from 'shared/nanoid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CDC_PUBLICATION_NAME, CDC_SLOT_NAME } from '../../constants';
import { cdcDb } from '../../lib/db';
import { drainBuffers } from '../../pipeline/handle-message';
import { createReplicationService, ensureReplicationSlot, setupBackpressure } from '../../pipeline/replication';
import { replicationState } from '../../services/replication-state';
import { wsClient } from '../../network/websocket-client';

const WS_PORT = Number(new URL(process.env.API_WS_URL ?? 'ws://127.0.0.1:4788').port || 4788);

/** Probe whether the configured DB can support this suite. */
async function probeReady(): Promise<boolean> {
  if (process.env.TEST_MODE === 'core') return false;
  try {
    const wal = await cdcDb.execute<{ wal_level: string }>(sql`SHOW wal_level`);
    if (wal.rows[0]?.wal_level !== 'logical') return false;
    const pub = await cdcDb.execute<{ ok: number }>(
      sql`SELECT 1 AS ok FROM pg_publication WHERE pubname = ${CDC_PUBLICATION_NAME}`,
    );
    return pub.rows.length > 0;
  } catch {
    return false;
  }
}

const READY = await probeReady();

/** Poll a predicate until it holds or the deadline passes. */
async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs: number, label: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(50);
  }
  throw new Error(`Timeout waiting for: ${label}`);
}

/** Current retained WAL for the CDC slot, in bytes. */
async function slotLagBytes(): Promise<number> {
  const res = await cdcDb.execute<{ lag: string | null }>(
    sql`SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)::text AS lag
        FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`,
  );
  return Number(res.rows[0]?.lag ?? 0);
}

async function slotActive(): Promise<boolean> {
  const res = await cdcDb.execute<{ active: boolean }>(
    sql`SELECT active FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`,
  );
  return res.rows[0]?.active ?? false;
}

/** Insert a tracked `tenant` row (minimal columns) → one activity dispatched. */
async function insertTenant(name: string): Promise<string> {
  // `id` has a JS-side default in the Drizzle schema (not a DB default), so generate it here.
  const id = nanoidTenant();
  await cdcDb.execute(sql`INSERT INTO tenants (id, name) VALUES (${id}, ${name})`);
  return id;
}

describe.skipIf(!READY)('CDC backpressure (integration)', () => {
  // biome-ignore lint/suspicious/noExplicitAny: lightweight ws stub typing
  let WebSocketServer: any;
  // biome-ignore lint/suspicious/noExplicitAny: lightweight ws stub typing
  let wss: any = null;
  /** Activity messages received by the stub WS receiver (excludes health pushes). */
  let activityMsgs: Array<{ subjectId: string | null }> = [];
  // biome-ignore lint/suspicious/noExplicitAny: pg-logical-replication service
  let service: any;

  /** Start (or restart) the stub WS receiver on the worker's configured port. */
  async function startStubWs(): Promise<void> {
    await new Promise<void>((resolve) => {
      wss = new WebSocketServer({ port: WS_PORT });
      // biome-ignore lint/suspicious/noExplicitAny: ws socket
      wss.on('connection', (socket: any) => {
        // biome-ignore lint/suspicious/noExplicitAny: ws data
        socket.on('message', (data: any) => {
          try {
            const parsed = JSON.parse(data.toString());
            // Activity dispatches carry an `activity` payload; ignore health pushes.
            if (parsed?.activity) activityMsgs.push({ subjectId: parsed.activity.subjectId ?? null });
          } catch {
            // ignore non-JSON / control frames
          }
        });
      });
      wss.on('listening', () => resolve());
    });
  }

  /** Close the stub WS receiver and forcibly drop all sockets. */
  async function stopStubWs(): Promise<void> {
    if (!wss) return;
    // biome-ignore lint/suspicious/noExplicitAny: ws clients set
    for (const client of wss.clients as Set<any>) client.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    wss = null;
  }

  beforeAll(async () => {
    ({ WebSocketServer } = await import('ws'));

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

    await startStubWs();

    // Bring up the worker pipeline directly (no infinite reconnect loop, so teardown is clean).
    await ensureReplicationSlot();
    service = createReplicationService();
    replicationState.service = service;
    setupBackpressure();
    wsClient.connect();
    replicationState.status = 'active';
    const plugin = new PgoutputPlugin({ protoVersion: 1, publicationNames: [CDC_PUBLICATION_NAME] });
    // subscribe() stays pending while streaming; it resolves on service.stop().
    service.subscribe(plugin, CDC_SLOT_NAME).catch(() => {});

    await waitFor(() => wsClient.isConnected(), 15_000, 'worker WS connected');
    await waitFor(() => slotActive(), 15_000, 'replication slot active');
  }, 30_000);

  afterAll(async () => {
    wsClient.close();
    await service?.stop().catch(() => {});
    await drainBuffers().catch(() => {});
    await stopStubWs();
    // Drop the slot so reruns start clean (service.stop releases the active flag first).
    await waitFor(async () => !(await slotActive()), 10_000, 'slot released').catch(() => {});
    await cdcDb
      .execute(
        sql`SELECT pg_drop_replication_slot(${CDC_SLOT_NAME})
            WHERE EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME})`,
      )
      .catch(() => {});
  });

  it('delivers a tracked change downstream and advances the slot', async () => {
    const before = activityMsgs.length;
    const id = await insertTenant(`bp-happy-${Date.now()}`);

    await waitFor(() => activityMsgs.some((m) => m.subjectId === id), 15_000, 'activity delivered to WS');
    expect(activityMsgs.length).toBeGreaterThan(before);

    // With WS up, the slot should drain back down (acks flowing).
    await waitFor(async () => (await slotLagBytes()) < 65_536, 15_000, 'slot drained while WS up');
  }, 30_000);

  it('retains WAL while the WebSocket is down (no ack)', async () => {
    await stopStubWs();
    await waitFor(() => !wsClient.isConnected(), 10_000, 'worker WS disconnected');
    await waitFor(() => replicationState.status === 'paused', 10_000, 'replication paused');

    const lagBefore = await slotLagBytes();

    // Commit a clear burst of WAL while acks are held.
    for (let i = 0; i < 200; i++) await insertTenant(`bp-down-${i}-${Date.now()}`);

    const lagAfter = await slotLagBytes();
    expect(lagAfter).toBeGreaterThan(lagBefore);
    // The replication connection to Postgres itself stays up — only acking pauses.
    expect(await slotActive()).toBe(true);
  }, 30_000);

  it('resumes acking and delivery after the WebSocket returns', async () => {
    const lagPeak = await slotLagBytes();
    activityMsgs = [];

    await startStubWs();
    // Force an immediate reconnect rather than waiting out the exponential backoff
    // that accumulated while the stub was down (keeps the test fast and deterministic).
    wsClient.close();
    wsClient.connect();
    await waitFor(() => wsClient.isConnected(), 20_000, 'worker WS reconnected');
    await waitFor(() => replicationState.status === 'active', 20_000, 'replication resumed');

    // Acks resume → retained WAL drains well below the WS-down peak.
    await waitFor(async () => (await slotLagBytes()) < Math.max(65_536, lagPeak / 2), 30_000, 'slot drained after reconnect');

    // Delivery resumes for new changes.
    const id = await insertTenant(`bp-resume-${Date.now()}`);
    await waitFor(() => activityMsgs.some((m) => m.subjectId === id), 15_000, 'delivery resumed after reconnect');
  }, 60_000);
});
