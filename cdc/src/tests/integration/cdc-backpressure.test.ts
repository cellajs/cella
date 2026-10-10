import { eq, inArray, sql } from 'drizzle-orm';
import { generateId } from 'shared/utils/entity-id';
import { nanoidTenant } from 'shared/utils/nanoid';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { activitiesTable } from '#/modules/activities/activities-db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { mockAttachment } from '#/modules/attachment/attachment-mocks';
import { recalculateCounters } from '#/modules/entities/counters-queries';
import { organizationsTable } from '#/modules/organization/organization-db';
import { mockOrganization } from '#/modules/organization/organization-mocks';
import { CDC_PUBLICATION_NAME, CDC_SLOT_NAME } from '../../constants';
import { cdcDb } from '../../lib/db';
import { wsClient } from '../../network/websocket-client';
import { ApiUnreachableError } from '../../services/failure';
import { replicationState } from '../../services/replication-state';
import { replicationStatus } from '../../services/replication-status';
import { type AttachmentHome, type CdcPipelineHarness, seedAttachmentHome, slotActive, startCdcPipeline, waitFor } from './pipeline-harness';

const WS_PORT = Number(new URL(process.env.BACKEND_INTERNAL_URL ?? 'http://127.0.0.1:4788').port || 4788);

/** Probe whether the configured DB can support this suite. TEST_MODE gating lives in vitest.config.ts. */
async function probeReady(): Promise<boolean> {
  try {
    const wal = await cdcDb.execute<{ wal_level: string }>(sql`SHOW wal_level`);
    if (wal.rows[0]?.wal_level !== 'logical') return false;
    const pub = await cdcDb.execute<{ ok: number }>(sql`SELECT 1 AS ok FROM pg_publication WHERE pubname = ${CDC_PUBLICATION_NAME}`);
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

/** Whether the slot has acknowledged a position at or past `target`. */
async function slotReached(target: string): Promise<boolean> {
  const slot = await cdcDb.execute<{ reached: boolean }>(sql`
    SELECT confirmed_flush_lsn >= ${target}::pg_lsn AS reached FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}
  `);
  return slot.rows[0]?.reached === true;
}

/** How many activities the worker recorded for these subjects. */
const recordedOf = async (ids: string[]) =>
  (await cdcDb.select({ id: activitiesTable.id }).from(activitiesTable).where(inArray(activitiesTable.subjectId, ids))).length;

/** A message for a row as the stub API received it: its activity id, and the rows it speaks for. */
interface ReceivedMessage {
  activityId: string;
  rowIds: string[];
}

/**
 * The worker's real subscription loop against a stub API: nothing is recorded while the API is away, and a flush that
 * fails is read again by the loop itself. Skipped unless the database runs with `wal_level = logical` and has `cdc_pub`.
 */
describe.skipIf(!READY)('CDC backpressure (integration)', () => {
  let WebSocketServer: any;
  let wss: any = null;
  /** Messages for rows that the stub API received (health pushes left out). */
  let received: ReceivedMessage[] = [];
  let harness: CdcPipelineHarness | null = null;
  const startedAt = new Date().toISOString();
  const organizationTenantId = nanoidTenant();
  const organizationId = generateId();
  /** Every tenant and attachment this suite wrote, for the cleanup. */
  const tenantIds: string[] = [organizationTenantId];
  const attachmentIds: string[] = [];
  let home: AttachmentHome;
  /** Tenants written while the stub was down. */
  const burstIds: string[] = [];

  const delivered = (id: string) => received.some((message) => message.rowIds.includes(id));

  /** Start (or restart) the stub WS receiver on the worker's configured port. */
  async function startStubWs(): Promise<void> {
    await new Promise<void>((resolve) => {
      wss = new WebSocketServer({ port: WS_PORT });
      wss.on('connection', (socket: any) => {
        socket.on('message', (data: any) => {
          try {
            const { activity, rows } = JSON.parse(data.toString());
            // A message for rows carries an `activity`; a product message names each of its rows, any other is its one row.
            if (activity) received.push({ activityId: activity.id, rowIds: rows?.map((row: any) => row.rowData.id) ?? [activity.subjectId] });
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

  /** Insert a tracked `tenant` row (minimal columns): one activity, one message. */
  async function insertTenant(name: string): Promise<string> {
    // `id` has a JS-side default in the Drizzle schema (not a DB default), so generate it here.
    const id = nanoidTenant();
    tenantIds.push(id);
    await cdcDb.execute(sql`INSERT INTO tenants (id, name) VALUES (${id}, ${name})`);
    return id;
  }

  /** The columns of a new attachment in the suite's organization: a product row, which gets a sequence value. */
  const attachmentRow = () => {
    const id = generateId();
    attachmentIds.push(id);
    return {
      ...mockAttachment(`backpressure:${id}`),
      id,
      tenantId: organizationTenantId,
      organizationId,
      ...home.columns,
      createdBy: null,
      updatedBy: null,
      deletedBy: null,
      seq: 0,
    };
  };

  const counts = async () =>
    ((await cdcDb.execute(sql`SELECT counts FROM channel_counters WHERE channel_key = ${organizationId}`)).rows[0]?.counts ?? {}) as Record<
      string,
      number
    >;

  beforeAll(async () => {
    ({ WebSocketServer } = await import('ws'));

    await startStubWs();

    // The loop rebuilds counters that are empty on a database with a history: the books start from what the tables hold.
    await cdcDb.execute(sql`INSERT INTO tenants (id, name) VALUES (${organizationTenantId}, ${`bp-org-${organizationTenantId}`})`);
    await cdcDb
      .insert(organizationsTable)
      .values({ ...mockOrganization(), id: organizationId, tenantId: organizationTenantId, slug: `bp-${organizationTenantId}`, createdBy: null });
    home = await seedAttachmentHome({ id: organizationId, tenantId: organizationTenantId });
    await recalculateCounters({ var: { db: cdcDb } });

    harness = await startCdcPipeline();
  }, 30_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    await harness?.stop();
    await stopStubWs();
    const subjects = [...tenantIds, ...attachmentIds, organizationId];
    await cdcDb.delete(activitiesTable).where(inArray(activitiesTable.subjectId, subjects));
    if (attachmentIds.length) await cdcDb.delete(attachmentsTable).where(inArray(attachmentsTable.id, attachmentIds));
    await home.remove();
    await cdcDb.execute(sql`DELETE FROM channel_counters WHERE channel_key = ${organizationId}`);
    await cdcDb.delete(organizationsTable).where(eq(organizationsTable.id, organizationId));
    await cdcDb.execute(
      sql`DELETE FROM tenants WHERE id IN (${sql.join(
        tenantIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
    await cdcDb.execute(sql`DELETE FROM sync_incidents WHERE created_at >= ${startedAt}`);
  }, 60_000);

  it('delivers a tracked change downstream and advances the slot', async () => {
    const before = received.length;
    const id = await insertTenant(`bp-happy-${Date.now()}`);

    await waitFor(() => delivered(id), 15_000, 'activity delivered to WS');
    expect(received.length).toBeGreaterThan(before);

    // With WS up, the slot should drain back down (acks flowing).
    await waitFor(async () => (await slotLagBytes()) < 65_536, 15_000, 'slot drained while WS up');
  }, 30_000);

  it('advances an idle slot past WAL that carries no published change', async () => {
    // A flush acknowledges the commit of its last source transaction; only the idle acknowledgement moves the slot past what follows.
    const res = await cdcDb.execute<{ target: string }>(sql`
      SELECT pg_logical_emit_message(false, 'cdc-idle-test', repeat('x', 1048576))::text AS target
    `);

    await waitFor(() => slotReached(res.rows[0].target), 15_000, 'idle slot advanced past unpublished WAL');
  }, 30_000);

  it('moves the slot past a source transaction whose rows the worker drops entirely, with nothing else written', async () => {
    const id = await insertTenant(`bp-dropped-${Date.now()}`);
    await waitFor(() => delivered(id), 15_000, 'the tenant recorded');
    const messages = received.length;

    // An update that changes no column: Postgres writes it to the WAL, and the parser drops it. Its source transaction
    // leaves nothing to record, so no flush acknowledges it.
    await cdcDb.execute(sql`UPDATE tenants SET name = name WHERE id = ${id}`);
    const { target } = (await cdcDb.execute<{ target: string }>(sql`SELECT pg_current_wal_flush_lsn()::text AS target`)).rows[0];

    // The idle acknowledgement of the keepalive position does: within a few seconds, with no other change to help.
    await waitFor(() => slotReached(target), 5000, 'the slot moved past the commit of the dropped transaction');
    expect(await recordedOf([id])).toBe(1);
    expect(received.length).toBe(messages);
  }, 30_000);

  it('records nothing while the API is away: the changes stay in the WAL', async () => {
    await stopStubWs();
    await waitFor(() => !wsClient.isConnected(), 10_000, 'worker WS disconnected');
    await waitFor(() => replicationStatus() === 'paused', 10_000, 'replication paused');

    const lagBefore = await slotLagBytes();

    // Committed while the worker has no API to hand them to.
    for (let i = 0; i < 200; i++) burstIds.push(await insertTenant(`bp-down-${i}-${Date.now()}`));

    // Long enough for a worker that still recorded to have recorded the burst.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await recordedOf(burstIds)).toBe(0);
    expect(replicationState.failure).toBeNull();

    expect(await slotLagBytes()).toBeGreaterThan(lagBefore);
    // The replication connection to Postgres itself stays up: the stream is held, not dropped.
    expect(await slotActive()).toBe(true);
  }, 30_000);

  it('delivers every change written meanwhile once the API is back, and acknowledges them', async () => {
    received = [];

    await startStubWs();
    // No nudge: the worker's own reconnect brings the socket back.
    await waitFor(() => wsClient.isConnected(), 20_000, 'worker WS reconnected');
    await waitFor(() => replicationStatus() === 'active', 20_000, 'replication resumed');

    await waitFor(() => burstIds.every(delivered), 30_000, 'the whole burst delivered after reconnect');
    expect(await recordedOf(burstIds)).toBe(burstIds.length);

    await waitFor(async () => (await slotLagBytes()) < 65_536, 30_000, 'backlog acknowledged after reconnect');

    const id = await insertTenant(`bp-resume-${Date.now()}`);
    await waitFor(() => delivered(id), 30_000, 'delivery goes on after reconnect');
  }, 120_000);

  it('reads again by itself after a flush that failed, and records every change once', async () => {
    received = [];
    const before = await counts();
    const subscription = replicationState.service;
    const tenant = { id: nanoidTenant(), name: `bp-again-${Date.now()}` };
    tenantIds.push(tenant.id);
    const attachments = [attachmentRow(), attachmentRow(), attachmentRow()];

    // The second message of the next flush is not taken: the socket is cut between the two.
    let sends = 0;
    const realSend = wsClient.send.bind(wsClient);
    const send = vi.spyOn(wsClient, 'send').mockImplementation((data: unknown) => {
      sends += 1;
      if (sends === 2) throw new ApiUnreachableError();
      realSend(data);
    });

    // One source transaction, so one flush: the tenant goes to the API alone and first, the attachments after it.
    await cdcDb.transaction(async (tx) => {
      await tx.execute(sql`INSERT INTO tenants (id, name) VALUES (${tenant.id}, ${tenant.name})`);
      await tx.insert(attachmentsTable).values(attachments);
    });

    const ids = attachments.map((attachment) => attachment.id);
    await waitFor(() => ids.every(delivered), 20_000, 'the attachments delivered by the second read');
    await waitFor(() => replicationState.failure === null, 10_000, 'the failure is behind the worker');
    send.mockRestore();

    // The flush failed after it was recorded, and the loop made a new subscription without any help.
    expect(sends).toBeGreaterThanOrEqual(4);
    expect(replicationState.service).not.toBe(subscription);

    // Recorded once, however often delivered: one activity for each row.
    for (const id of [tenant.id, ...ids]) expect(await recordedOf([id])).toBe(1);
    // One sequence value for each product row, and the counters moved by exactly these rows.
    const seqs = (await cdcDb.select({ seq: attachmentsTable.seq }).from(attachmentsTable).where(inArray(attachmentsTable.id, ids))).map((row) =>
      Number(row.seq),
    );
    const after = await counts();
    expect(after.sequence).toBe((before.sequence ?? 0) + 3);
    expect([...seqs].sort((a, b) => a - b)).toEqual([after.sequence - 2, after.sequence - 1, after.sequence]);
    expect(after['e:c:attachment']).toBe((before['e:c:attachment'] ?? 0) + 3);

    // Delivery is at least once: the tenant's message went out on both reads, with the same activity id.
    const tenantMessages = received.filter((message) => message.rowIds.includes(tenant.id));
    expect(tenantMessages).toHaveLength(2);
    expect(tenantMessages[0].activityId).toBe(tenantMessages[1].activityId);
    expect(received.filter((message) => message.rowIds.includes(ids[0]))).toHaveLength(1);
  }, 60_000);
});
