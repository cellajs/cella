import { desc, eq, inArray, sql } from 'drizzle-orm';
import { PgoutputPlugin } from 'pg-logical-replication';
import { appConfig, hierarchy } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoidTenant } from 'shared/utils/nanoid';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { activitiesTable } from '#/modules/activities/activities-db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { mockAttachment } from '#/modules/attachment/attachment-mocks';
import { recalculateCounters } from '#/modules/entities/counters-queries';
import { syncIncidentsTable, syncStateTable } from '#/modules/entities/sync-state-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { mockOrganization } from '#/modules/organization/organization-mocks';
import { CDC_PUBLICATION_NAME, CDC_SLOT_NAME, RESOURCE_LIMITS } from '../../constants';
import { cdcDb } from '../../lib/db';
import { resetBuffers } from '../../pipeline/handle-message';
import { createReplicationService, settleLostCases } from '../../pipeline/replication';
import { rebuildBooks, restoreBooksState, startBooksSchedule, stopBooksSchedule, verifyBooks } from '../../pipeline/verify';
import { fence } from '../../services/fence';
import { replicationState } from '../../services/replication-state';
import { type CdcPipelineHarness, slotActive, startCdcPipeline, waitFor } from './pipeline-harness';

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

/**
 * Verify and rebuild on the real pipeline: rows are written to the database, read from the replication stream and
 * recorded, and the books are compared with the tables while that goes on.
 */
describe.skipIf(!READY)('Verify and rebuild (integration)', () => {
  const tenantId = nanoidTenant();
  const organizationId = generateId();
  const attachmentIds: string[] = [];
  const startedAt = new Date().toISOString();
  let WebSocketServer: any;
  let wss: any = null;
  let harness: CdcPipelineHarness | null = null;
  const plugin = new PgoutputPlugin({ protoVersion: 1, publicationNames: [CDC_PUBLICATION_NAME], messages: true });

  const insertAttachment = async (): Promise<string> => {
    const id = generateId();
    attachmentIds.push(id);
    await cdcDb.insert(attachmentsTable).values({
      ...mockAttachment(`verify:${id}`),
      id,
      tenantId,
      organizationId,
      ...Object.fromEntries(hierarchy.getNullableAncestors('attachment').map((type) => [appConfig.entityIdColumnKeys[type], null])),
      createdBy: null,
      updatedBy: null,
      deletedBy: null,
      seq: 0,
    });
    return id;
  };

  const counts = async () =>
    ((await cdcDb.execute(sql`SELECT counts FROM channel_counters WHERE channel_key = ${organizationId}`)).rows[0]?.counts ?? {}) as Record<
      string,
      number
    >;
  const liveAttachments = async () =>
    Number(
      (await cdcDb.execute(sql`SELECT count(*) FROM attachments WHERE organization_id = ${organizationId} AND deleted_at IS NULL`)).rows[0].count,
    );
  const highestSeq = async () =>
    Number((await cdcDb.execute(sql`SELECT coalesce(max(seq), 0) AS seq FROM attachments WHERE organization_id = ${organizationId}`)).rows[0].seq);
  const recordedFor = async (ids: string[]) =>
    (await cdcDb.select({ id: activitiesTable.id }).from(activitiesTable).where(inArray(activitiesTable.subjectId, ids))).length;
  const generation = async () => (await cdcDb.select().from(syncStateTable).where(eq(syncStateTable.id, 'sync')))[0]?.generation ?? 1;
  const lastIncident = async () => (await cdcDb.select().from(syncIncidentsTable).orderBy(desc(syncIncidentsTable.createdAt)).limit(1))[0];
  const incidentCount = async () =>
    Number((await cdcDb.execute(sql`SELECT count(*) FROM sync_incidents WHERE created_at >= ${startedAt}`)).rows[0].count);

  /** Waits until the worker recorded these rows: each has its activity. */
  const recorded = (ids: string[]) => waitFor(async () => (await recordedFor(ids)) >= ids.length, 20_000, 'rows recorded');

  /** Ends the subscription and leaves the slot where it is, as a worker that stopped does. */
  const stopReading = async () => {
    await replicationState.service?.stop();
    await waitFor(async () => !(await slotActive()), 10_000, 'slot released');
    replicationState.markStopped();
  };

  /** A new subscription on the same slot, as the worker's loop makes one. */
  const readAgain = async () => {
    resetBuffers();
    const service = createReplicationService();
    replicationState.service = service;
    replicationState.flushFailed = false;
    replicationState.status = 'active';
    service.subscribe(plugin, CDC_SLOT_NAME).catch(() => {});
    await waitFor(() => slotActive(), 15_000, 'slot active again');
  };

  beforeAll(async () => {
    ({ WebSocketServer } = await import('ws'));
    await new Promise<void>((resolve) => {
      wss = new WebSocketServer({ port: WS_PORT });
      wss.on('listening', () => resolve());
    });

    await cdcDb.execute(sql`INSERT INTO tenants (id, name) VALUES (${tenantId}, ${`verify-${tenantId}`})`);
    await cdcDb
      .insert(organizationsTable)
      .values({ ...mockOrganization(), id: organizationId, tenantId, slug: `verify-${tenantId}`, createdBy: null });
    // Other suites leave rows and counters of their own: the books start from what the tables hold.
    await recalculateCounters({ var: { db: cdcDb } });

    harness = await startCdcPipeline();
  }, 60_000);

  afterAll(async () => {
    await replicationState.service?.stop().catch(() => {});
    await harness?.stop();
    if (wss) {
      for (const client of wss.clients as Set<any>) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    }
    fence.close();
    if (attachmentIds.length) {
      await cdcDb.delete(activitiesTable).where(inArray(activitiesTable.subjectId, attachmentIds));
      await cdcDb.delete(attachmentsTable).where(inArray(attachmentsTable.id, attachmentIds));
    }
    await cdcDb.execute(sql`DELETE FROM activities WHERE subject_id IN (${organizationId}, ${tenantId})`);
    await cdcDb.execute(sql`DELETE FROM channel_counters WHERE channel_key = ${organizationId}`);
    await cdcDb.delete(organizationsTable).where(eq(organizationsTable.id, organizationId));
    await cdcDb.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}`);
    await cdcDb.execute(sql`DELETE FROM sync_incidents WHERE created_at >= ${startedAt}`);
    await cdcDb.update(syncStateTable).set({ fence: null, requested: null }).where(eq(syncStateTable.id, 'sync'));
  }, 60_000);

  it('finds the books right while rows are written, and writes nothing', async () => {
    const first = [await insertAttachment(), await insertAttachment(), await insertAttachment()];
    await recorded(first);
    const before = await generation();

    // Rows keep arriving while the count runs: some commit before its snapshot and are recorded after it.
    let writing = true;
    const written: string[] = [];
    const writer = (async () => {
      while (writing) written.push(await insertAttachment());
    })();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const corrections = await verifyBooks('requested');
    writing = false;
    await writer;
    await recorded(written);

    expect(written.length).toBeGreaterThan(0);
    expect(corrections).toEqual([]);
    expect(await generation()).toBe(before);
    expect(await incidentCount()).toBe(0);
    expect((await counts())['e:c:attachment']).toBe(await liveAttachments());
  }, 60_000);

  it('must not leave a wrong count or a low sequence counter standing: it corrects each by its difference and records it', async () => {
    const live = await liveAttachments();
    const highest = await highestSeq();
    const before = await generation();
    // A lost increment, and a sequence counter behind a value a row already holds.
    await cdcDb.execute(sql`
      UPDATE channel_counters SET counts = counts || ${JSON.stringify({ 'e:c:attachment': live + 3, sequence: 1 })}::jsonb
      WHERE channel_key = ${organizationId}
    `);

    const corrections = await verifyBooks('requested');

    expect(corrections).toEqual(
      expect.arrayContaining([
        { channelKey: organizationId, key: 'e:c:attachment', stored: live + 3, counted: live },
        { channelKey: organizationId, key: 'sequence', stored: 1, counted: highest },
      ]),
    );
    const after = await counts();
    expect(after['e:c:attachment']).toBe(live);
    expect(after.sequence).toBe(highest);
    // Clients are told: another generation, and a record of what was wrong.
    const corrected = await generation();
    expect(corrected).toBeGreaterThan(before);
    expect(await lastIncident()).toMatchObject({ kind: 'verify_corrected', reason: 'requested', generation: corrected });

    // Positive control: right books again.
    expect(await verifyBooks('requested')).toEqual([]);
    expect(await generation()).toBe(corrected);
  }, 60_000);

  it('must not hand out a generation again after a backup took the counter back', async () => {
    const live = await liveAttachments();
    // A client holds a generation from minutes ago; the restored database holds the small number of its backup.
    const held = Math.floor(Date.now() / 60_000) - 5;
    await cdcDb.update(syncStateTable).set({ generation: 3 }).where(eq(syncStateTable.id, 'sync'));
    await cdcDb.execute(sql`
      UPDATE channel_counters SET counts = counts || ${JSON.stringify({ 'e:c:attachment': live + 1 })}::jsonb WHERE channel_key = ${organizationId}
    `);

    await verifyBooks('requested');

    // One more than the backup's would be 4, a number a client may hold from before: the clock keeps it past them all.
    expect(await generation()).toBeGreaterThan(held);
  }, 60_000);

  it('rebuilds lost counters from the tables, and must not count a change twice that the count already saw', async () => {
    await stopReading();
    // Committed, and still ahead in the stream: the next subscription delivers them.
    const unread = [await insertAttachment(), await insertAttachment()];
    // What a truncate or a partial restore does to the table.
    await cdcDb.execute(sql`TRUNCATE channel_counters`);
    const before = await generation();

    await rebuildBooks('lost_counters');

    const live = await liveAttachments();
    expect((await counts())['e:c:attachment']).toBe(live);
    expect((await counts()).sequence).toBe(await highestSeq());
    expect(await generation()).toBeGreaterThan(before);
    expect(await lastIncident()).toMatchObject({ kind: 'rebuild', reason: 'lost_counters', generation: await generation() });

    await readAgain();
    await recorded(unread);
    const later = await insertAttachment();
    await recorded([later]);
    await waitFor(() => fence.mode === null, 20_000, 'the stream passed the rebuild');

    // The two unread rows were in the count: recorded now, they add nothing. The row written after it adds one.
    expect((await counts())['e:c:attachment']).toBe(live + 1);
    expect((await counts())['e:c:attachment']).toBe(await liveAttachments());
    // Their activities and sequence values are recorded as always.
    expect(await recordedFor(unread)).toBe(2);
    expect((await cdcDb.select().from(syncStateTable).where(eq(syncStateTable.id, 'sync')))[0].fence).toBeNull();
    expect(await verifyBooks('requested')).toEqual([]);
  }, 90_000);

  it('gives up the backlog of a worker stuck on a change, and has the books right after', async () => {
    await stopReading();
    const backlog = [await insertAttachment(), await insertAttachment()];

    await rebuildBooks('stuck', { position: '0/AB', error: 'null value in column "organization_id"' });

    expect(await lastIncident()).toMatchObject({
      kind: 'rebuild',
      reason: 'stuck',
      positionFrom: '0/AB',
      error: 'null value in column "organization_id"',
    });
    expect((await lastIncident()).positionTo).toMatch(/^[0-9A-F]+\/[0-9A-F]+$/);

    await readAgain();
    const later = await insertAttachment();
    await recorded([later]);
    await waitFor(() => fence.mode === null, 20_000, 'the stream passed the rebuild');

    // The backlog was given up: no activity for it. The tables still hold its rows, so the count does too.
    expect(await recordedFor(backlog)).toBe(0);
    expect((await counts())['e:c:attachment']).toBe(await liveAttachments());
    expect(await verifyBooks('requested')).toEqual([]);
  }, 90_000);

  it('keeps the fence of a rebuild across a restart of the worker', async () => {
    await stopReading();
    await rebuildBooks('requested');
    // The process ends here: what it held in memory is gone.
    fence.close();

    await restoreBooksState();

    expect(fence.mode).toBe('rebuild');
    await readAgain();
    await waitFor(() => fence.mode === null, 20_000, 'the stream passed the rebuild');
  }, 60_000);

  it('must not wait for a marker the slot has confirmed: a worker that died before forgetting its fence forgets it at its start', async () => {
    await stopReading();
    await rebuildBooks('requested');
    const [{ fence: kept }] = await cdcDb.select().from(syncStateTable).where(eq(syncStateTable.id, 'sync'));
    await readAgain();
    await waitFor(() => fence.mode === null, 20_000, 'the stream passed the rebuild');
    const slotPast = async () =>
      (
        await cdcDb.execute(
          sql`SELECT confirmed_flush_lsn >= ${kept?.markerLsn}::pg_lsn AS past FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`,
        )
      ).rows[0]?.past === true;
    await waitFor(slotPast, 20_000, 'the slot confirmed the marker');

    // The process ended between acknowledging the marker and forgetting the fence: the marker never arrives again.
    await cdcDb.update(syncStateTable).set({ fence: kept }).where(eq(syncStateTable.id, 'sync'));
    await restoreBooksState();

    expect(fence.mode).toBeNull();
    expect((await cdcDb.select().from(syncStateTable).where(eq(syncStateTable.id, 'sync')))[0].fence).toBeNull();
    // A fence left open would keep every verify from running.
    expect(await verifyBooks('requested')).toEqual([]);
  }, 60_000);

  describe('the lost cases, between two subscriptions', () => {
    const incidentsSince = async (since: string) =>
      (
        await cdcDb.select().from(syncIncidentsTable).where(sql`${syncIncidentsTable.createdAt} > ${since}`).orderBy(syncIncidentsTable.createdAt)
      ).map(({ kind, reason }) => `${kind}:${reason}`);
    const dbNow = async () => (await cdcDb.execute<{ now: string }>(sql`SELECT clock_timestamp()::timestamp::text AS now`)).rows[0].now;

    afterAll(() => {
      vi.useRealTimers();
    });

    it('rebuilds when a slot had to be made on a database with a history', async () => {
      await stopReading();
      const since = await dbNow();

      await settleLostCases(true);

      expect(await incidentsSince(since)).toEqual(['rebuild:lost_slot']);
    }, 60_000);

    it('rebuilds when the counters are gone', async () => {
      await cdcDb.execute(sql`TRUNCATE channel_counters`);
      const since = await dbNow();

      await settleLostCases(false);

      expect(await incidentsSince(since)).toEqual(['rebuild:lost_counters']);
      expect((await counts())['e:c:attachment']).toBe(await liveAttachments());
    }, 60_000);

    it('does nothing when nothing is lost (positive control)', async () => {
      const since = await dbNow();

      await settleLostCases(false);

      expect(await incidentsSince(since)).toEqual([]);
    }, 60_000);

    it('rebuilds for a worker stuck on a change, and must not do so again within the interval', async () => {
      const refused = Object.assign(new Error('null value in column "organization_id"'), { code: '23502' });
      const stick = () => {
        for (let attempt = 0; attempt < RESOURCE_LIMITS.reread.stuckAfter; attempt++) replicationState.recordFailure('0/AB', refused);
      };
      const since = await dbNow();

      // The rebuilds above were moments ago: a fault that repeats costs one rebuild per interval.
      stick();
      await settleLostCases(false);
      expect(await incidentsSince(since)).toEqual([]);
      expect(replicationState.stuck).toBe(true);

      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + RESOURCE_LIMITS.books.rebuildIntervalMs + 1000);
      await settleLostCases(false);
      vi.useRealTimers();

      expect(await incidentsSince(since)).toEqual(['rebuild:stuck']);
      expect(replicationState.failure).toBeNull();
      await readAgain();
      await waitFor(() => fence.mode === null, 20_000, 'the stream passed the rebuild');
    }, 60_000);

    const syncState = async () => (await cdcDb.select().from(syncStateTable).where(eq(syncStateTable.id, 'sync')))[0];
    /** Runs `fn` while no incident can be written, as a worker that dies before its rebuild commits. */
    const withoutIncidents = async (fn: () => Promise<void>) => {
      await cdcDb.execute(sql`ALTER TABLE sync_incidents RENAME TO sync_incidents_away`);
      try {
        await fn();
      } finally {
        await cdcDb.execute(sql`ALTER TABLE sync_incidents_away RENAME TO sync_incidents`);
      }
    };

    it('must not replace the books without their incident and their generation: a rebuild is one transaction', async () => {
      await stopReading();
      const before = await generation();
      const since = await dbNow();
      // A count no table gives, so a rebuild that committed would show.
      await cdcDb.execute(sql`
        UPDATE channel_counters SET counts = counts || ${JSON.stringify({ 'e:c:attachment': 9999 })}::jsonb WHERE channel_key = ${organizationId}
      `);

      await withoutIncidents(() => expect(rebuildBooks('requested')).rejects.toThrow());

      expect((await counts())['e:c:attachment']).toBe(9999);
      expect(await generation()).toBe(before);
      expect((await syncState()).fence).toBeNull();
      expect(fence.mode).toBeNull();

      // Positive control: the same rebuild with its incident.
      await rebuildBooks('requested');
      expect((await counts())['e:c:attachment']).toBe(await liveAttachments());
      expect(await generation()).toBeGreaterThan(before);
      expect(await incidentsSince(since)).toEqual(['rebuild:requested']);
    }, 60_000);

    it('rebuilds at its next start when the worker died after giving up a backlog', async () => {
      const backlog = [await insertAttachment(), await insertAttachment()];

      // The slot moves, and the rebuild that should follow does not commit.
      await withoutIncidents(() => expect(rebuildBooks('stuck', { position: '0/AB', error: 'refused' })).rejects.toThrow());
      expect((await syncState()).requested).toBe('rebuild');

      // The next start knows nothing of the failure: only the request says a rebuild is owed.
      replicationState.clearFailure();
      const since = await dbNow();
      await settleLostCases(false);

      expect(await incidentsSince(since)).toEqual(['rebuild:requested']);
      expect((await syncState()).requested).toBeNull();
      expect((await counts())['e:c:attachment']).toBe(await liveAttachments());
      expect(await recordedFor(backlog)).toBe(0);
    }, 60_000);

    it('answers a request with the rebuild a lost case starts: one rebuild, not two', async () => {
      await cdcDb.update(syncStateTable).set({ requested: 'rebuild' }).where(eq(syncStateTable.id, 'sync'));
      replicationState.rebuildRequested = true;
      await cdcDb.execute(sql`TRUNCATE channel_counters`);
      const since = await dbNow();

      await settleLostCases(false);
      // The subscription after it.
      await settleLostCases(false);

      expect(await incidentsSince(since)).toEqual(['rebuild:lost_counters']);
      expect((await syncState()).requested).toBeNull();
      expect(replicationState.rebuildRequested).toBe(false);

      await readAgain();
      await waitFor(() => fence.mode === null, 20_000, 'the stream passed the rebuild');
    }, 60_000);

    it('verifies when asked through the sync state, as `pnpm sync:verify` does', async () => {
      const since = await dbNow();
      await cdcDb.update(syncStateTable).set({ requested: 'verify', requestedAt: since }).where(eq(syncStateTable.id, 'sync'));

      startBooksSchedule();
      try {
        await waitFor(
          async () => {
            const [state] = await cdcDb.select().from(syncStateTable).where(eq(syncStateTable.id, 'sync'));
            return state.requested === null && state.verifiedAt !== null && state.verifiedAt > since;
          },
          30_000,
          'the worker answered the request',
        );
      } finally {
        stopBooksSchedule();
      }

      expect(await incidentsSince(since)).toEqual([]);
    }, 60_000);
  });
});
