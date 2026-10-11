import { desc, eq, inArray, sql } from 'drizzle-orm';
import { generateId } from 'shared/utils/entity-id';
import { nanoidTenant } from 'shared/utils/nanoid';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { activitiesTable } from '#/modules/activities/activities-db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { mockAttachment } from '#/modules/attachment/attachment-mocks';
import { recalculateCounters } from '#/modules/entities/counters-queries';
import { awaitBooksAnswer, clearBooksRequest, findBooksRequest, requestBooks } from '#/modules/entities/sync-requests';
import { type SyncCorrection, syncIncidentsTable, syncStateTable } from '#/modules/entities/sync-state-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { mockOrganization } from '#/modules/organization/organization-mocks';
import { CDC_PUBLICATION_NAME, RESOURCE_LIMITS } from '../../constants';
import { cdcDb } from '../../lib/db';
import { settleLostCases } from '../../pipeline/replication';
import { answerBooksRequests, rebuildBooks, restoreBooksState, startBooksSchedule, stopBooksSchedule, verifyBooks } from '../../pipeline/verify';
import { fence } from '../../services/fence';
import { replicationState } from '../../services/replication-state';
import { lsnToBigInt } from '../../utils/lsn';
import { type AttachmentHome, type CdcPipelineHarness, seedAttachmentHome, startCdcPipeline, waitFor } from './pipeline-harness';

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
  /** An organization of its own, in its own tenant, for the test that needs an exact count. */
  const smallTenantId = nanoidTenant();
  const smallOrganizationId = generateId();
  const attachmentIds: string[] = [];
  /** Per organization, where its attachments live. */
  const homes: Record<string, AttachmentHome> = {};
  let startedAt = '';
  let WebSocketServer: any;
  let wss: any = null;
  let harness: CdcPipelineHarness | null = null;
  /** Whether the worker's loop runs: the steps below start and end it, whatever the test before left. */
  let reading = false;

  const insertAttachments = async (count: number, inOrganization = organizationId): Promise<string[]> => {
    const ids = Array.from({ length: count }, () => generateId());
    attachmentIds.push(...ids);
    await cdcDb.insert(attachmentsTable).values(
      ids.map((id) => ({
        ...mockAttachment(`verify:${id}`),
        id,
        tenantId: inOrganization === organizationId ? tenantId : smallTenantId,
        organizationId: inOrganization,
        ...homes[inOrganization].columns,
        createdBy: null,
        updatedBy: null,
        deletedBy: null,
        seq: 0,
      })),
    );
    return ids;
  };
  const insertAttachment = async (inOrganization = organizationId): Promise<string> => (await insertAttachments(1, inOrganization))[0];

  const counts = async (ofOrganization = organizationId) =>
    ((await cdcDb.execute(sql`SELECT counts FROM channel_counters WHERE channel_key = ${ofOrganization}`)).rows[0]?.counts ?? {}) as Record<
      string,
      number
    >;
  const liveAttachments = async (ofOrganization = organizationId) =>
    Number(
      (await cdcDb.execute(sql`SELECT count(*) FROM attachments WHERE organization_id = ${ofOrganization} AND deleted_at IS NULL`)).rows[0].count,
    );
  const highestSeq = async () =>
    Number((await cdcDb.execute(sql`SELECT coalesce(max(seq), 0) AS seq FROM attachments WHERE organization_id = ${organizationId}`)).rows[0].seq);
  const recordedFor = async (ids: string[]) =>
    (await cdcDb.select({ id: activitiesTable.id }).from(activitiesTable).where(inArray(activitiesTable.subjectId, ids))).length;
  const syncState = async () => (await cdcDb.select().from(syncStateTable).where(eq(syncStateTable.id, 'sync')))[0];
  const generation = async () => (await syncState())?.generation ?? 1;
  const lastIncident = async () => (await cdcDb.select().from(syncIncidentsTable).orderBy(desc(syncIncidentsTable.createdAt)).limit(1))[0];
  const dbNow = async () => (await cdcDb.execute<{ now: string }>(sql`SELECT clock_timestamp()::timestamp::text AS now`)).rows[0].now;
  const incidentsSince = async (since: string) =>
    await cdcDb.select().from(syncIncidentsTable).where(sql`${syncIncidentsTable.createdAt} > ${since}`).orderBy(syncIncidentsTable.createdAt);
  /** The reasons of the rebuilds since a moment, in order. */
  const rebuildsSince = async (since: string) => (await incidentsSince(since)).map(({ reason }) => reason);
  const setCounts = (values: Record<string, number>, ofOrganization = organizationId) =>
    cdcDb.execute(sql`UPDATE channel_counters SET counts = counts || ${JSON.stringify(values)}::jsonb WHERE channel_key = ${ofOrganization}`);

  /**
   * Runs `fn` while a writer inserts rows in a loop, `perInsert` at a time, from a moment before `fn` starts until a
   * moment after it ends. The ids of the rows it wrote are added to `written`.
   */
  const whileWriting = async <T>(written: string[], perInsert: number, fn: () => Promise<T>): Promise<T> => {
    let writing = true;
    const writer = (async () => {
      while (writing) written.push(...(await insertAttachments(perInsert)));
    })();
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const result = await fn();
      await new Promise((resolve) => setTimeout(resolve, 100));
      return result;
    } finally {
      writing = false;
      await writer;
    }
  };

  /** Waits until the worker recorded these rows: each has its activity. */
  const recorded = (ids: string[]) => waitFor(async () => (await recordedFor(ids)) >= ids.length, 20_000, 'rows recorded');

  /** Waits until the stream has passed the last rebuild: no fence is open, and the marker in `sync_state` is forgotten. */
  const fencePassed = async () => {
    await waitFor(() => fence.mode === null, 20_000, 'the stream passed the rebuild');
    await waitFor(async () => !(await syncState())?.fence, 20_000, 'the marker of the rebuild forgotten');
  };

  /** Ends the worker's loop and leaves the slot where it is, as a worker that stopped does. */
  const stopReading = async () => {
    if (reading) await harness?.stopReading();
    reading = false;
  };

  /** A new subscription on the same slot, made by the worker's loop. */
  const readAgain = async () => {
    if (!reading) await harness?.readAgain();
    reading = true;
  };

  /** The worker reads, and the stream has passed whatever rebuild the test before ran. */
  const readingWithNoFence = async () => {
    await readAgain();
    await fencePassed();
  };

  /**
   * Runs `fn` while no recount can finish: every recount waits for a table it reads and no flush of these tests
   * touches. The worker's sessions give up a lock after ten seconds, so `fn` is short.
   */
  const whileRecountsWait = (fn: () => Promise<void>) =>
    cdcDb.transaction(async (tx) => {
      await tx.execute(sql`LOCK TABLE inactive_memberships IN ACCESS EXCLUSIVE MODE`);
      await fn();
    });

  /** Runs `fn` while no incident can be written, as a worker that dies before its rebuild commits. */
  const withoutIncidents = async (fn: () => Promise<void>) => {
    await cdcDb.execute(sql`ALTER TABLE sync_incidents RENAME TO sync_incidents_away`);
    try {
      await fn();
    } finally {
      await cdcDb.execute(sql`ALTER TABLE sync_incidents_away RENAME TO sync_incidents`);
    }
  };

  beforeAll(async () => {
    ({ WebSocketServer } = await import('ws'));
    await new Promise<void>((resolve) => {
      wss = new WebSocketServer({ port: WS_PORT });
      wss.on('listening', () => resolve());
    });

    startedAt = await dbNow();
    await cdcDb.execute(
      sql`INSERT INTO tenants (id, name) VALUES (${tenantId}, ${`verify-${tenantId}`}), (${smallTenantId}, ${`verify-${smallTenantId}`})`,
    );
    await cdcDb.insert(organizationsTable).values([
      { ...mockOrganization(), id: organizationId, tenantId, slug: `verify-${tenantId}`, createdBy: null },
      { ...mockOrganization(), id: smallOrganizationId, tenantId: smallTenantId, slug: `verify-${smallTenantId}`, createdBy: null },
    ]);
    homes[organizationId] = await seedAttachmentHome({ id: organizationId, tenantId });
    homes[smallOrganizationId] = await seedAttachmentHome({ id: smallOrganizationId, tenantId: smallTenantId });
    // Other suites leave rows and counters of their own: the books start from what the tables hold.
    await recalculateCounters({ var: { db: cdcDb } });
    await cdcDb.update(syncStateTable).set({ fence: null, requested: null }).where(eq(syncStateTable.id, 'sync'));

    harness = await startCdcPipeline();
    reading = true;
  }, 60_000);

  afterAll(async () => {
    vi.useRealTimers();
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
    for (const home of Object.values(homes)) await home.remove();
    await cdcDb.execute(sql`DELETE FROM activities WHERE subject_id IN (${organizationId}, ${smallOrganizationId}, ${tenantId}, ${smallTenantId})`);
    await cdcDb.execute(sql`DELETE FROM channel_counters WHERE channel_key IN (${organizationId}, ${smallOrganizationId})`);
    await cdcDb.delete(organizationsTable).where(inArray(organizationsTable.id, [organizationId, smallOrganizationId]));
    await cdcDb.execute(sql`DELETE FROM tenants WHERE id IN (${tenantId}, ${smallTenantId})`);
    await cdcDb.execute(sql`DELETE FROM sync_incidents WHERE created_at >= ${startedAt}`);
    await cdcDb.update(syncStateTable).set({ fence: null, requested: null }).where(eq(syncStateTable.id, 'sync'));
  }, 60_000);

  describe('verify', () => {
    it('finds the books right while rows are written, and writes nothing', async () => {
      const first = await insertAttachments(3);
      await recorded(first);
      const before = await generation();

      // Rows keep arriving while the count runs: some commit before its snapshot and are recorded after it.
      const written: string[] = [];
      const differences = await whileWriting(written, 1, () => verifyBooks());
      await recorded(written);

      expect(written.length).toBeGreaterThan(0);
      expect(differences).toEqual([]);
      expect(await generation()).toBe(before);
      expect(await rebuildsSince(startedAt)).toEqual([]);
      expect((await counts())['e:c:attachment']).toBe(await liveAttachments());
    }, 60_000);

    it('must not leave a wrong count or a low sequence counter standing: it rebuilds the books and records what differed', async () => {
      await readingWithNoFence();
      const live = await liveAttachments();
      const highest = await highestSeq();
      const before = await generation();
      const since = await dbNow();
      // A lost increment, and a sequence counter behind a value a row already holds.
      await setCounts({ 'e:c:attachment': live + 3, sequence: 1 });

      const differences = await verifyBooks();

      expect(differences).toEqual(
        expect.arrayContaining([
          { channelKey: organizationId, key: 'e:c:attachment', stored: live + 3, counted: live },
          { channelKey: organizationId, key: 'sequence', stored: 1, counted: highest },
        ]),
      );
      const after = await counts();
      expect(after['e:c:attachment']).toBe(live);
      expect(after.sequence).toBe(highest);
      // Clients are told: another generation, and one record of what was wrong.
      const rebuilt = await generation();
      expect(rebuilt).toBeGreaterThan(before);
      const incidents = await incidentsSince(since);
      expect(incidents).toHaveLength(1);
      expect(incidents[0]).toMatchObject({ reason: 'wrong_books', corrections: differences, generation: rebuilt });
      expect(((await syncState()).verifiedAt ?? '') > since).toBe(true);

      // Positive control: right books again.
      await fencePassed();
      expect(await verifyBooks()).toEqual([]);
      expect(await generation()).toBe(rebuilt);
    }, 60_000);

    it('must not end above the tables when a delete is recorded inside the fence of a verify that found a count of zero', async () => {
      await readingWithNoFence();
      const pair = await insertAttachments(2, smallOrganizationId);
      const deleted = pair[1];
      await recorded(pair);
      // The books say none where the tables hold two rows.
      await setCounts({ 'e:c:attachment': 0 }, smallOrganizationId);

      let verifying: Promise<SyncCorrection[] | null> = Promise.resolve(null);
      await whileRecountsWait(async () => {
        verifying = verifyBooks();
        await waitFor(() => fence.mode === 'verify', 5000, 'the verify took its snapshot');
        // Recorded while the fence is open. Taking one from a count of zero leaves zero: adding the difference of two
        // to that would end at two, with one row left.
        await cdcDb.delete(attachmentsTable).where(eq(attachmentsTable.id, deleted));
        await waitFor(async () => (await recordedFor([deleted])) === 2, 5000, 'the delete recorded');
      });

      expect(await verifying).toEqual(expect.arrayContaining([{ channelKey: smallOrganizationId, key: 'e:c:attachment', stored: 0, counted: 2 }]));
      expect(await liveAttachments(smallOrganizationId)).toBe(1);
      expect((await counts(smallOrganizationId))['e:c:attachment']).toBe(1);
      await fencePassed();
      expect(await verifyBooks()).toEqual([]);
    }, 60_000);

    it('must not hand out a generation again after a backup took the counter back', async () => {
      await readingWithNoFence();
      const live = await liveAttachments();
      // A client holds a generation from minutes ago; the restored database holds the small number of its backup.
      const held = Math.floor(Date.now() / 60_000) - 5;
      await cdcDb.update(syncStateTable).set({ generation: 3 }).where(eq(syncStateTable.id, 'sync'));
      await setCounts({ 'e:c:attachment': live + 1 });

      await verifyBooks();

      // One more than the backup's would be 4, a number a client may hold from before: the clock keeps it past them all.
      expect(await generation()).toBeGreaterThan(held);
    }, 60_000);
  });

  describe('rebuild', () => {
    it('must not count a row twice when the books are rebuilt while the worker reads and rows are written', async () => {
      await readingWithNoFence();
      const service = replicationState.service;
      // Rows arrive faster than a flush records them, so one is in flight whenever the rebuild starts.
      const written: string[] = [];

      await whileWriting(written, 20, () => rebuildBooks('requested'));

      await recorded(written);
      await fencePassed();

      expect(written.length).toBeGreaterThan(0);
      expect((await counts())['e:c:attachment']).toBe(await liveAttachments());
      expect((await counts()).sequence).toBe(await highestSeq());
      // The subscription it ran beside is the one that still reads.
      expect(replicationState.service).toBe(service);
      expect(await verifyBooks()).toEqual([]);
    }, 120_000);

    it('rebuilds lost counters from the tables, and must not count a change twice that the count already saw', async () => {
      await readingWithNoFence();
      await stopReading();
      // Committed, and still ahead in the stream: the next subscription delivers them.
      const unread = await insertAttachments(2);
      // What a truncate or a partial restore does to the table.
      await cdcDb.execute(sql`TRUNCATE channel_counters`);
      const before = await generation();

      await rebuildBooks('lost_counters');

      const live = await liveAttachments();
      expect((await counts())['e:c:attachment']).toBe(live);
      expect((await counts()).sequence).toBe(await highestSeq());
      expect(await generation()).toBeGreaterThan(before);
      expect(await lastIncident()).toMatchObject({ reason: 'lost_counters', generation: await generation() });

      await readAgain();
      await recorded(unread);
      const later = await insertAttachment();
      await recorded([later]);
      await fencePassed();

      // The two unread rows were in the count: recorded now, they add nothing. The row written after it adds one.
      expect((await counts())['e:c:attachment']).toBe(live + 1);
      expect((await counts())['e:c:attachment']).toBe(await liveAttachments());
      // Their activities and sequence values are recorded as always.
      expect(await recordedFor(unread)).toBe(2);
      expect(await verifyBooks()).toEqual([]);
    }, 90_000);

    it('must not replace the books without their incident and their generation: a rebuild is one transaction', async () => {
      await readingWithNoFence();
      await stopReading();
      const before = await generation();
      const since = await dbNow();
      // A count no table gives, so a rebuild that committed would show.
      await setCounts({ 'e:c:attachment': 9999 });

      await withoutIncidents(() => expect(rebuildBooks('requested')).rejects.toThrow());

      expect((await counts())['e:c:attachment']).toBe(9999);
      expect(await generation()).toBe(before);
      expect((await syncState()).fence).toBeNull();
      expect(fence.mode).toBeNull();

      // Positive control: the same rebuild with its incident.
      await rebuildBooks('requested');
      expect((await counts())['e:c:attachment']).toBe(await liveAttachments());
      expect(await generation()).toBeGreaterThan(before);
      expect(await rebuildsSince(since)).toEqual(['requested']);
    }, 60_000);

    it('rebuilds again at its start when the worker ended inside the fence of a rebuild', async () => {
      await readingWithNoFence();
      await stopReading();
      // Committed and still ahead in the stream: the rebuild's recount sees them, and its fence leaves them out.
      const unread = await insertAttachments(2);
      await rebuildBooks('requested');
      const since = await dbNow();
      // The process ends here: what it held in memory is gone, and the marker in `sync_state` stays.
      fence.close();
      expect((await syncState()).fence).not.toBeNull();

      await restoreBooksState();
      await settleLostCases(false);
      // The subscription after it.
      await settleLostCases(false);

      expect(await rebuildsSince(since)).toEqual(['interrupted']);
      await readAgain();
      await recorded(unread);
      await fencePassed();
      // Without the second rebuild no fence would know the two rows: they would count once more.
      expect((await counts())['e:c:attachment']).toBe(await liveAttachments());
      expect(await verifyBooks()).toEqual([]);
    }, 90_000);

    it('must not rebuild at its start when the stream had passed the rebuild', async () => {
      await readingWithNoFence();
      await rebuildBooks('requested');
      await fencePassed();
      await stopReading();
      const since = await dbNow();

      await restoreBooksState();
      await settleLostCases(false);

      expect(await rebuildsSince(since)).toEqual([]);
    }, 60_000);

    it('must not start a verify while a rebuild runs: one books operation at a time', async () => {
      await readingWithNoFence();

      const rebuilding = rebuildBooks('requested');
      const verified = await verifyBooks();
      await rebuilding;

      expect(verified).toBeNull();
      // Positive control: once the stream has passed the rebuild, a verify runs.
      await fencePassed();
      expect(await verifyBooks()).toEqual([]);
    }, 60_000);

    it('leaves a verify that is asked for waiting when the books are rebuilt meanwhile', async () => {
      await readingWithNoFence();
      await requestBooks(cdcDb, 'verify');

      await rebuildBooks('lost_counters');

      // The rebuild stamps no `verified_at`: whoever asked still gets the answer of a verify.
      expect(await findBooksRequest(cdcDb)).toBe('verify');
      await clearBooksRequest(cdcDb, 'verify');
    }, 60_000);
  });

  describe('the lost cases, between two subscriptions', () => {
    const refused = Object.assign(new Error('null value in column "organization_id"'), { code: '23502' });
    /** Five failed reads of one change: the worker is stuck there. */
    const stick = () => {
      for (let attempt = 0; attempt < RESOURCE_LIMITS.reread.stuckAfter; attempt++) replicationState.recordFailure('0/AB', refused);
    };

    let intervalsPassed = 0;
    /** Runs `fn` with the clock past the rebuild interval, counted from the last rebuild a test ran that way. */
    const pastTheInterval = async (fn: () => Promise<void>) => {
      intervalsPassed += 1;
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + intervalsPassed * (RESOURCE_LIMITS.books.rebuildIntervalMs + 1000));
      try {
        await fn();
      } finally {
        vi.useRealTimers();
      }
    };

    it('rebuilds when a slot had to be made on a database with a history', async () => {
      await readingWithNoFence();
      await stopReading();
      const since = await dbNow();

      await settleLostCases(true);

      expect(await rebuildsSince(since)).toEqual(['lost_slot']);
    }, 60_000);

    it('rebuilds when the counters are gone', async () => {
      await stopReading();
      await cdcDb.execute(sql`TRUNCATE channel_counters`);
      const since = await dbNow();

      await settleLostCases(false);

      expect(await rebuildsSince(since)).toEqual(['lost_counters']);
      expect((await counts())['e:c:attachment']).toBe(await liveAttachments());
    }, 60_000);

    it('does nothing when nothing is lost (positive control)', async () => {
      await stopReading();
      const since = await dbNow();

      await settleLostCases(false);

      expect(await rebuildsSince(since)).toEqual([]);
    }, 60_000);

    it('gives up the backlog of a worker stuck on a change, and has the books right after', async () => {
      await readingWithNoFence();
      await stopReading();
      const backlog = await insertAttachments(2);
      const since = await dbNow();
      stick();

      await pastTheInterval(() => settleLostCases(false));

      const [incident, ...others] = await incidentsSince(since);
      expect(others).toEqual([]);
      expect(incident).toMatchObject({ reason: 'stuck', positionFrom: '0/AB', error: refused.message });
      expect(incident.positionTo).toMatch(/^[0-9A-F]+\/[0-9A-F]+$/);
      expect(replicationState.failure).toBeNull();
      // The status timer of the next subscription repeats what was acknowledged last, and an acknowledgement reports
      // the byte after its position: that must be where the slot is now, not a position behind it.
      expect(lsnToBigInt(replicationState.lastAckedLsn ?? '0/0') + 1n).toBe(lsnToBigInt(incident.positionTo ?? '0/0'));

      await readAgain();
      const later = await insertAttachment();
      await recorded([later]);
      await fencePassed();

      // The backlog was given up: no activity for it. The tables still hold its rows, so the count does too.
      expect(await recordedFor(backlog)).toBe(0);
      expect((await counts())['e:c:attachment']).toBe(await liveAttachments());
      expect(await verifyBooks()).toEqual([]);
    }, 90_000);

    it('must not rebuild for a stuck worker again within the interval', async () => {
      await readingWithNoFence();
      await stopReading();
      const since = await dbNow();

      // The rebuild above was moments ago: a fault that repeats costs one rebuild per interval.
      stick();
      await settleLostCases(false);
      expect(await rebuildsSince(since)).toEqual([]);
      expect(replicationState.stuck).toBe(true);

      // Positive control: past the interval it does.
      await pastTheInterval(() => settleLostCases(false));
      expect(await rebuildsSince(since)).toEqual(['stuck']);
      expect(replicationState.failure).toBeNull();
    }, 60_000);

    it('rebuilds at its next start when the worker died after giving up a backlog', async () => {
      await readingWithNoFence();
      await stopReading();
      const backlog = await insertAttachments(2);
      stick();

      // The slot moves, and the rebuild that should follow does not commit.
      await withoutIncidents(() => pastTheInterval(() => expect(settleLostCases(false)).rejects.toThrow()));
      expect(await findBooksRequest(cdcDb)).toBe('rebuild');

      // The next start knows nothing of the failure: only the request says a rebuild is owed.
      replicationState.clearFailure();
      const since = await dbNow();
      await settleLostCases(false);

      expect(await rebuildsSince(since)).toEqual(['requested']);
      expect(await findBooksRequest(cdcDb)).toBeNull();
      expect((await counts())['e:c:attachment']).toBe(await liveAttachments());
      expect(await recordedFor(backlog)).toBe(0);
    }, 60_000);

    it('answers a request with the rebuild a lost case starts: one rebuild, not two', async () => {
      await stopReading();
      await requestBooks(cdcDb, 'rebuild');
      await cdcDb.execute(sql`TRUNCATE channel_counters`);
      const since = await dbNow();

      await settleLostCases(false);
      // The subscription after it.
      await settleLostCases(false);

      expect(await rebuildsSince(since)).toEqual(['lost_counters']);
      expect(await findBooksRequest(cdcDb)).toBeNull();
    }, 60_000);
  });

  describe('requests, answered while the worker reads', () => {
    it('verifies when asked through the sync state, as `pnpm sync:verify` does', async () => {
      await readingWithNoFence();
      const before = await dbNow();
      const since = await requestBooks(cdcDb, 'verify');

      startBooksSchedule();
      try {
        expect(await awaitBooksAnswer(cdcDb, 'verify', since, 30)).toEqual({ answered: true, differences: [], generation: await generation() });
        await waitFor(async () => (await findBooksRequest(cdcDb)) === null, 5000, 'the request taken out');
      } finally {
        stopBooksSchedule();
      }

      expect(await rebuildsSince(before)).toEqual([]);
    }, 60_000);

    it('answers a verify that found the books wrong with what differed, after it rebuilt them', async () => {
      await readingWithNoFence();
      const live = await liveAttachments();
      await setCounts({ 'e:c:attachment': live + 3 });
      const since = await requestBooks(cdcDb, 'verify');

      await answerBooksRequests();

      const answer = await awaitBooksAnswer(cdcDb, 'verify', since, 5);
      expect(answer).toEqual({
        answered: true,
        differences: [{ channelKey: organizationId, key: 'e:c:attachment', stored: live + 3, counted: live }],
        generation: await generation(),
      });
      expect(await rebuildsSince(since)).toEqual(['wrong_books']);
      expect(await findBooksRequest(cdcDb)).toBeNull();
      expect((await counts())['e:c:attachment']).toBe(live);
    }, 60_000);

    it('rebuilds when asked through the sync state, as `pnpm sync:rebuild` does, and must not end the subscription for it', async () => {
      await readingWithNoFence();
      const service = replicationState.service;
      const since = await requestBooks(cdcDb, 'rebuild');

      await answerBooksRequests();

      expect(await awaitBooksAnswer(cdcDb, 'rebuild', since, 5)).toEqual({ answered: true, differences: [], generation: await generation() });
      expect(await rebuildsSince(since)).toEqual(['requested']);
      expect(await findBooksRequest(cdcDb)).toBeNull();
      expect(replicationState.service).toBe(service);
      expect(replicationState.subscribed).toBe(true);
      await fencePassed();
      expect(await verifyBooks()).toEqual([]);
    }, 60_000);

    it('must not start a rebuild that is asked for while a verify is open: one books operation at a time', async () => {
      await readingWithNoFence();
      const since = await dbNow();

      let verifying: Promise<SyncCorrection[] | null> = Promise.resolve(null);
      await whileRecountsWait(async () => {
        verifying = verifyBooks();
        await waitFor(() => fence.mode === 'verify', 5000, 'the verify took its snapshot');
        await requestBooks(cdcDb, 'rebuild');

        await answerBooksRequests();

        expect(await rebuildsSince(since)).toEqual([]);
        expect(fence.mode).toBe('verify');
      });
      expect(await verifying).toEqual([]);

      // The request waited: the next poll answers it.
      expect(await findBooksRequest(cdcDb)).toBe('rebuild');
      await answerBooksRequests();
      expect(await rebuildsSince(since)).toEqual(['requested']);
      expect(await findBooksRequest(cdcDb)).toBeNull();
    }, 60_000);

    it('must not skip the daily verify on a day the worker could not read at its hour', async () => {
      await readingWithNoFence();
      await stopReading();
      const since = await dbNow();

      // A day later the verify hour has come, whatever the time is now.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 24 * 60 * 60e3);
      try {
        await answerBooksRequests();
      } finally {
        vi.useRealTimers();
      }

      // No subscription, so no verify: it stays asked for.
      expect(await findBooksRequest(cdcDb)).toBe('verify');
      expect(((await syncState()).verifiedAt ?? '') > since).toBe(false);

      await readAgain();
      await answerBooksRequests();

      expect(((await syncState()).verifiedAt ?? '') > since).toBe(true);
      expect(await findBooksRequest(cdcDb)).toBeNull();
      // Asked for once that day: the next poll writes no second request.
      await answerBooksRequests();
      expect(await findBooksRequest(cdcDb)).toBeNull();
    }, 60_000);

    it('must not verify again at once after a verify that gave no answer: a recount that cannot finish does not run back to back', async () => {
      await readingWithNoFence();
      // The verify recounts, and then cannot write its answer.
      await cdcDb.execute(sql`ALTER TABLE sync_state RENAME TO sync_state_away`);
      try {
        expect(await verifyBooks()).toBeNull();
      } finally {
        await cdcDb.execute(sql`ALTER TABLE sync_state_away RENAME TO sync_state`);
      }
      const since = await dbNow();
      await requestBooks(cdcDb, 'verify');

      await answerBooksRequests();

      // Still asked for, and not tried: the next poll is five seconds away, the next verify ten minutes.
      expect(await findBooksRequest(cdcDb)).toBe('verify');
      expect(((await syncState()).verifiedAt ?? '') > since).toBe(false);

      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + RESOURCE_LIMITS.books.rebuildIntervalMs + 1000);
      try {
        await answerBooksRequests();
      } finally {
        vi.useRealTimers();
      }

      expect(((await syncState()).verifiedAt ?? '') > since).toBe(true);
      expect(await findBooksRequest(cdcDb)).toBeNull();
    }, 60_000);

    it('must not replace a request that waits when the daily verify is asked for', async () => {
      await stopReading();
      await requestBooks(cdcDb, 'rebuild');

      await requestBooks(cdcDb, 'verify', { unlessRequested: true });

      expect(await findBooksRequest(cdcDb)).toBe('rebuild');
      // Positive control: with nothing asked for, the verify is.
      await clearBooksRequest(cdcDb, 'rebuild');
      await requestBooks(cdcDb, 'verify', { unlessRequested: true });
      expect(await findBooksRequest(cdcDb)).toBe('verify');
      await clearBooksRequest(cdcDb, 'verify');
    }, 60_000);

    it('takes a request back that no worker answered in time', async () => {
      await stopReading();
      const since = await requestBooks(cdcDb, 'verify');

      const answer = await awaitBooksAnswer(cdcDb, 'verify', since, 1);

      expect(answer).toMatchObject({ answered: false, differences: [] });
      expect(await findBooksRequest(cdcDb)).toBeNull();
    }, 60_000);
  });
});
