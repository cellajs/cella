import { sql } from 'drizzle-orm';
import { nanoidTenant } from 'shared/utils/nanoid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CDC_PUBLICATION_NAME, CDC_SLOT_NAME } from '../../constants';
import { cdcDb } from '../../lib/db';
import { wsClient } from '../../network/websocket-client';
import { replicationState } from '../../services/replication-state';
import { lsnToBigInt } from '../../utils/lsn';
import { type CdcPipelineHarness, slotActive, startCdcPipeline, waitFor } from './pipeline-harness';

const WS_PORT = Number(new URL(process.env.API_WS_URL ?? 'ws://127.0.0.1:4788').port || 4788);

/** Probe whether the configured DB can support this suite. TEST_MODE gating lives in vitest.config.ts. */
async function probeReady(): Promise<boolean> {
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

/** Current retained WAL for the CDC slot, in bytes. */
async function slotLagBytes(): Promise<number> {
  const res = await cdcDb.execute<{ lag: string | null }>(
    sql`SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)::text AS lag
        FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`,
  );
  return Number(res.rows[0]?.lag ?? 0);
}

/** Insert a tracked `tenant` row (minimal columns) → one activity dispatched. */
async function insertTenant(name: string): Promise<string> {
  // `id` has a JS-side default in the Drizzle schema (not a DB default), so generate it here.
  const id = nanoidTenant();
  await cdcDb.execute(sql`INSERT INTO tenants (id, name) VALUES (${id}, ${name})`);
  return id;
}

/**
 * Verifies `setupBackpressure`: while the downstream WebSocket is down the worker stops
 * acking the replication slot (WAL retained, no data loss), and acks resume once it returns.
 * Skipped unless `DATABASE_CDC_URL` runs with `wal_level = logical` and `cdc_pub` exists.
 */
describe.skipIf(!READY)('CDC backpressure (integration)', () => {
  let WebSocketServer: any;
  let wss: any = null;
  /** Activity messages received by the stub WS receiver (excludes health pushes). */
  let activityMsgs: Array<{ subjectId: string | null }> = [];
  let harness: CdcPipelineHarness | null = null;

  /** Start (or restart) the stub WS receiver on the worker's configured port. */
  async function startStubWs(): Promise<void> {
    await new Promise<void>((resolve) => {
      wss = new WebSocketServer({ port: WS_PORT });
      wss.on('connection', (socket: any) => {
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
    for (const client of wss.clients as Set<any>) client.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    wss = null;
  }

  beforeAll(async () => {
    ({ WebSocketServer } = await import('ws'));

    await startStubWs();

    // Bring up the worker pipeline directly (no infinite reconnect loop, so teardown is clean).
    harness = await startCdcPipeline();
  }, 30_000);

  afterAll(async () => {
    await harness?.stop();
    await stopStubWs();
  });

  it('delivers a tracked change downstream and advances the slot', async () => {
    const before = activityMsgs.length;
    const id = await insertTenant(`bp-happy-${Date.now()}`);

    await waitFor(() => activityMsgs.some((m) => m.subjectId === id), 15_000, 'activity delivered to WS');
    expect(activityMsgs.length).toBeGreaterThan(before);

    // With WS up, the slot should drain back down (acks flowing).
    await waitFor(async () => (await slotLagBytes()) < 65_536, 15_000, 'slot drained while WS up');
  }, 30_000);

  it('advances an idle slot past WAL that carries no published change', async () => {
    // Data acks stop at the last published row; only the idle keepalive ack can confirm what follows.
    const res = await cdcDb.execute<{ target: string }>(sql`
      SELECT pg_logical_emit_message(false, 'cdc-idle-test', repeat('x', 1048576))::text AS target
    `);
    const target = res.rows[0].target;

    const slotReached = async () => {
      const slot = await cdcDb.execute<{ reached: boolean }>(sql`
        SELECT confirmed_flush_lsn >= ${target}::pg_lsn AS reached
        FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}
      `);
      return slot.rows[0]?.reached === true;
    };
    await waitFor(slotReached, 15_000, 'idle slot advanced past unpublished WAL');
  }, 30_000);

  it('retains WAL while the WebSocket is down (no ack)', async () => {
    await stopStubWs();
    await waitFor(() => !wsClient.isConnected(), 10_000, 'worker WS disconnected');
    await waitFor(() => replicationState.status === 'paused', 10_000, 'replication paused');

    const lagBefore = await slotLagBytes();

    // Commit a clear burst of WAL while acks are held.
    for (let i = 0; i < 199; i++) await insertTenant(`bp-down-${i}-${Date.now()}`);
    const wal = await cdcDb.execute<{ lsn: string }>(sql`SELECT pg_current_wal_lsn()::text AS lsn`);
    await insertTenant(`bp-down-last-${Date.now()}`);

    // The whole burst is applied and its ack withheld before the WebSocket returns: no flush is left
    // to straddle the reconnect, so only the reconnect itself can release the held position.
    const lastInsertFloor = lsnToBigInt(wal.rows[0].lsn);
    await waitFor(
      () => !!replicationState.heldAckLsn && lsnToBigInt(replicationState.heldAckLsn) >= lastInsertFloor,
      20_000,
      'burst applied with its ack withheld',
    );

    const lagAfter = await slotLagBytes();
    expect(lagAfter).toBeGreaterThan(lagBefore);
    // The replication connection to Postgres itself stays up: only acking pauses.
    expect(await slotActive()).toBe(true);
  }, 30_000);

  it('resumes acking and delivery after the WebSocket returns', async () => {
    const lagPeak = await slotLagBytes();
    activityMsgs = [];

    await startStubWs();
    // Force an immediate reconnect to keep this test independent of the backoff timer.
    // that accumulated while the stub was down (keeps the test fast and deterministic).
    wsClient.close();
    wsClient.connect();
    await waitFor(() => wsClient.isConnected(), 20_000, 'worker WS reconnected');
    await waitFor(() => replicationState.status === 'active', 20_000, 'replication resumed');

    // Acks resume → retained WAL drains well below the WS-down peak.
    await waitFor(
      async () => (await slotLagBytes()) < Math.max(65_536, lagPeak / 2),
      30_000,
      'slot drained after reconnect',
    );

    // Drain to the floor before probing a fresh change: the previous threshold still allows
    // half the burst to be in flight, whose replay competes with the probe on a slow runner.
    await waitFor(async () => (await slotLagBytes()) < 65_536, 30_000, 'backlog fully drained after reconnect');

    const id = await insertTenant(`bp-resume-${Date.now()}`);
    await waitFor(() => activityMsgs.some((m) => m.subjectId === id), 30_000, 'delivery resumed after reconnect');
  }, 120_000);
});
