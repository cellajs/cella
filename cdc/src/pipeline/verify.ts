import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import { isForwardOnlyCounterKey, isPlainCountKey } from '#/modules/entities/counter-keys';
import { computeChannelCounters, recalculateCounters } from '#/modules/entities/counters-queries';
import { clearBooksRequest, findBooksRequest, requestBooks } from '#/modules/entities/sync-requests';
import { type SyncCorrection, type SyncFence, syncIncidentsTable, syncStateId, syncStateTable } from '#/modules/entities/sync-state-db';
import { RESOURCE_LIMITS } from '../constants';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import { pushHealth } from '../network/health-reporter';
import { type CounterDeltas, fence } from '../services/fence';
import { replicationState } from '../services/replication-state';
import { replicationStatus } from '../services/replication-status';
import { FENCE_MARKER_PREFIX, runBetweenFlushes } from './handle-message';

const { countTimeoutMs, verifyTimeoutMs, rebuildIntervalMs, verifyHourUtc, requestPollMs } = RESOURCE_LIMITS.books;

type Counters = Map<string, Record<string, number>>;
type Executor = Pick<typeof cdcDb, 'execute'>;
type Transaction = Parameters<Parameters<typeof cdcDb.transaction>[0]>[0];
type Incident = typeof syncIncidentsTable.$inferInsert;

/** Why the books were rebuilt, as the incident says it. */
type IncidentReason = Incident['reason'];

/** What an incident says besides its reason: the positions of a backlog that was given up with its error, or what a verify found different. */
type IncidentDetails = Pick<Incident, 'positionFrom' | 'positionTo' | 'error' | 'corrections'>;

/**
 * Compares the stored counters with a count from the tables taken at one snapshot. A plain count must equal what was
 * stored at the snapshot plus the changes the count already saw and the worker recorded later. The sequence counter
 * and a frontier may be ahead of the tables (values handed out to rows deleted since) but never behind them. Only
 * channels the count yields are compared: a counter row of a channel that is gone is nobody's book.
 * @returns One difference per key that is wrong; empty when the books are right.
 */
export function compareBooks(stored: Counters, counted: Counters, alreadyCounted: CounterDeltas): SyncCorrection[] {
  const differences: SyncCorrection[] = [];
  for (const [channelKey, countedCounts] of counted) {
    const storedCounts = stored.get(channelKey) ?? {};
    const seenCounts = alreadyCounted.get(channelKey) ?? {};
    for (const key of new Set([...Object.keys(countedCounts), ...Object.keys(storedCounts)])) {
      const countedValue = Number(countedCounts[key] ?? 0);
      if (isForwardOnlyCounterKey(key)) {
        const storedValue = Number(storedCounts[key] ?? 0);
        if (countedValue > storedValue) differences.push({ channelKey, key, stored: storedValue, counted: countedValue });
      } else if (isPlainCountKey(key)) {
        const expected = Number(storedCounts[key] ?? 0) + (seenCounts[key] ?? 0);
        if (expected !== countedValue) differences.push({ channelKey, key, stored: expected, counted: countedValue });
      }
    }
  }
  return differences;
}

async function readStoredCounters(db: Executor): Promise<Counters> {
  const rows = await db.execute<{ channel_key: string; counts: Record<string, number> }>(sql`SELECT channel_key, counts FROM channel_counters`);
  return new Map(rows.rows.map((row) => [row.channel_key, row.counts]));
}

/** The first query of a REPEATABLE READ transaction fixes its snapshot: everything it reads afterwards is as of that snapshot. */
async function takeSnapshot(tx: Transaction): Promise<string> {
  return (await tx.execute<{ snapshot: string }>(sql`SELECT pg_current_snapshot()::text AS snapshot`)).rows[0].snapshot;
}

/**
 * Writes the marker: the logical message that tells the stream it has passed a snapshot. Not transactional, so it is
 * in the WAL at once, whatever becomes of the transaction that counts.
 */
async function emitMarker(marker: string): Promise<void> {
  await cdcDb.execute(sql`SELECT pg_logical_emit_message(false, ${FENCE_MARKER_PREFIX}, ${marker})`);
}

/**
 * The next generation: one more, and never below the clock in minutes. A database restored from a backup holds an
 * older number, and its next one must not be a number some client already holds.
 */
const nextGeneration = sql`GREATEST(${syncStateTable.generation} + 1, floor(extract(epoch FROM now()) / 60)::int)`;

/**
 * What every rebuild leaves in the database: the next generation, which makes every client refetch, and a row in
 * `sync_incidents`. Written in the transaction that replaces the books, so the books never change without it.
 * @returns The new generation.
 */
async function writeIncident(tx: Transaction, reason: IncidentReason, details: IncidentDetails): Promise<number> {
  await tx.insert(syncStateTable).values({ id: syncStateId }).onConflictDoNothing();
  const [state] = await tx
    .update(syncStateTable)
    .set({ generation: nextGeneration, rebuiltAt: sql`now()` })
    .where(eq(syncStateTable.id, syncStateId))
    .returning({ generation: syncStateTable.generation });
  await tx.insert(syncIncidentsTable).values({ reason, ...details, generation: state.generation });
  return state.generation;
}

/**
 * After that transaction committed: health carries the generation to the API at once, and the log gets its line. An
 * error, so a rare failure is not missed; a rebuild somebody asked for is no failure.
 */
function announceIncident(reason: IncidentReason, generation: number, details: IncidentDetails): void {
  replicationState.generation = generation;
  pushHealth();
  log[reason === 'requested' ? 'info' : 'error']('Sync books rebuilt from the tables: clients refetch', {
    reason,
    generation,
    ...details,
    corrections: details.corrections?.slice(0, 20),
    correctionCount: details.corrections?.length ?? 0,
  });
}

/**
 * How many books operations run: a verify, a rebuild, or the rebuild a verify ends in. The schedule starts one only at
 * zero, so a rebuild that was asked for never opens its fence over the one of a verify.
 */
let operations = 0;

/** When the last rebuild was, in epoch ms: read from `sync_state` at the start, so the interval holds across a restart. */
let lastRebuildAt = 0;

/** True when the worker found a rebuild's fence in `sync_state` at its start: it ended before the stream had passed that rebuild. */
let fenceLeftOpen = false;

/**
 * Closes a rebuild's fence once the stream has passed its marker, and forgets it in the database. A fence another
 * rebuild took over is that rebuild's to close.
 */
function closeFenceWhenPassed(marker: string): void {
  void fence
    .whenPassed()
    .then(async (passed) => {
      if (!passed || fence.marker !== marker) return;
      fence.close();
      await cdcDb
        .update(syncStateTable)
        .set({ fence: null })
        .where(and(eq(syncStateTable.id, syncStateId), sql`${syncStateTable.fence}->>'marker' = ${marker}`));
      log.info('The stream has passed the rebuild: every change counts again');
    })
    .catch((error) => log.warn('Could not clear the rebuild fence', { err: error }));
}

/**
 * The one repair of books that are wrong or lost: they are replaced by a recount from the tables, and every client
 * refetches. Runs exactly between two flushes, with or without a subscription. The recount is taken at a snapshot, and
 * until the stream has passed it, a source transaction the recount already saw adds nothing to the plain counts. The
 * new counters, the fence, the incident and the next generation are one transaction: a worker that dies leaves either
 * all of it or none.
 * @param reason - Why the books are rebuilt.
 * @param details - What the incident records besides the reason.
 */
export async function rebuildBooks(reason: IncidentReason, details: IncidentDetails = {}): Promise<void> {
  operations += 1;
  try {
    const marker = randomUUID();
    const generation = await runBetweenFlushes(async () => {
      let snapshot = '';
      const committed = await cdcDb.transaction(
        async (tx) => {
          snapshot = await takeSnapshot(tx);
          await emitMarker(marker);
          await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${countTimeoutMs}`));
          await recalculateCounters({ var: { db: tx } });
          const next = await writeIncident(tx, reason, details);
          const kept: SyncFence = { marker };
          await tx.update(syncStateTable).set({ fence: kept }).where(eq(syncStateTable.id, syncStateId));
          // A rebuild answers a request for one, whatever started it. A verify that is asked for still gets its own answer.
          await clearBooksRequest(tx, 'rebuild');
          return next;
        },
        { isolationLevel: 'repeatable read' },
      );
      // Still between two flushes: the next one already leaves out what the recount saw. A verify's fence that was
      // open ends here, and that verify gives no answer.
      fence.open('rebuild', snapshot, marker);
      closeFenceWhenPassed(marker);
      return committed;
    });

    announceIncident(reason, generation, details);
    lastRebuildAt = Date.now();
    fenceLeftOpen = false;
    replicationState.clearFailure();
  } finally {
    operations -= 1;
  }
}

/**
 * Checks the books against the tables while the worker reads on. The snapshot is taken exactly between two flushes;
 * the recount runs beside the stream, and the comparison waits until the stream has passed the snapshot. A verify only
 * detects: when the books are right nothing but `verified_at` is written, and when they differ the books are rebuilt,
 * with the differences in the incident.
 * @returns The differences found (empty when the books were right), or null when it could not run or finish.
 */
export async function verifyBooks(): Promise<SyncCorrection[] | null> {
  if (operations > 0 || fence.mode || replicationStatus() !== 'active') return null;
  operations += 1;
  const marker = randomUUID();
  let stored: Counters = new Map();
  let counted: Counters = new Map();
  let counting: Promise<void> = Promise.resolve();
  let timer: NodeJS.Timeout | undefined;

  try {
    await runBetweenFlushes(
      () =>
        new Promise<void>((taken, failed) => {
          counting = cdcDb.transaction(
            async (tx) => {
              const snapshot = await takeSnapshot(tx);
              await emitMarker(marker);
              fence.open('verify', snapshot, marker);
              taken();
              await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${verifyTimeoutMs}`));
              stored = await readStoredCounters(tx);
              counted = await computeChannelCounters({ var: { db: tx } });
            },
            { isolationLevel: 'repeatable read' },
          );
          counting.catch(failed);
        }),
    );

    const passed = await Promise.race([
      Promise.all([counting, fence.whenPassed()]).then(([, streamPassed]) => streamPassed),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), verifyTimeoutMs);
        timer.unref?.();
      }),
    ]);
    if (!passed || fence.marker !== marker) {
      log.warn('Verify abandoned: the stream did not pass its recount in time, or a rebuild took its place');
      verifyGaveUpAt = Date.now();
      return null;
    }

    const differences = compareBooks(stored, counted, fence.close());
    if (differences.length > 0) await rebuildBooks('wrong_books', { corrections: differences });
    await cdcDb.insert(syncStateTable).values({ id: syncStateId }).onConflictDoNothing();
    await cdcDb.update(syncStateTable).set({ verifiedAt: sql`now()` }).where(eq(syncStateTable.id, syncStateId));
    log.info('Sync books verified', { channels: counted.size, differences: differences.length });
    return differences;
  } catch (error) {
    log.warn('Verify failed', { err: error });
    verifyGaveUpAt = Date.now();
    return null;
  } finally {
    clearTimeout(timer);
    if (fence.marker === marker) fence.close();
    operations -= 1;
  }
}

/** When a verify last started and ended without an answer: it timed out, failed, or the rebuild it asked for did. */
let verifyGaveUpAt = 0;

/** A fault that repeats costs one rebuild and one refetch per interval, not one per failing change. */
export const rebuildAllowed = (): boolean => Date.now() - lastRebuildAt >= rebuildIntervalMs;

/**
 * Reads the sync state when the worker starts: the generation health reports, when the last rebuild was, and whether
 * a rebuild's fence was left open.
 */
export async function restoreBooksState(): Promise<void> {
  const [state] = await cdcDb.select().from(syncStateTable).where(eq(syncStateTable.id, syncStateId));
  replicationState.generation = state?.generation ?? 1;
  if (state?.rebuiltAt) lastRebuildAt = new Date(`${state.rebuiltAt}Z`).getTime();
  fenceLeftOpen = Boolean(state?.fence);
  booksStateRestored = true;
}

let booksStateRestored = false;

/** Reads the sync state if the read at the worker's start failed: without it an interrupted rebuild goes unnoticed. */
export const ensureBooksStateRestored = async (): Promise<void> => {
  if (!booksStateRestored) await restoreBooksState();
};

/**
 * Whether the worker before this one ended inside the fence of a rebuild. What that fence left out is gone with its
 * process, so the changes it covered would count twice: the books are rebuilt again.
 */
export const rebuildWasInterrupted = (): boolean => fenceLeftOpen;

/**
 * What the lost-case checks before a subscription start from, in one query. `hasHistory`: the database has activities,
 * so a slot that had to be made on it missed changes. `countersAreLost`: the counters are gone while it has a history,
 * which a truncate or a partial restore leaves behind.
 */
export async function readLostCaseFacts(): Promise<{ hasHistory: boolean; countersAreLost: boolean }> {
  const result = await cdcDb.execute<{ counters: boolean; history: boolean }>(
    sql`SELECT EXISTS (SELECT 1 FROM ${channelCountersTable}) AS counters, EXISTS (SELECT 1 FROM activities) AS history`,
  );
  const { counters, history } = result.rows[0];
  return { hasHistory: history, countersAreLost: history && !counters };
}

/** The next time the clock shows the verify hour, in epoch ms. */
function nextVerifyAt(now = Date.now()): number {
  const next = new Date(now);
  next.setUTCHours(verifyHourUtc, 0, 0, 0);
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime();
}

/** When the worker asks itself for the next daily verify. */
let dailyVerifyAt = nextVerifyAt();

let scheduleTimer: NodeJS.Timeout | null = null;

/**
 * One poll of the schedule. At the verify hour the worker asks itself for a verify, as `pnpm sync:verify` does: one
 * that cannot run now stays asked for, and a later poll finds it. Then it answers what is asked for while the
 * subscription stays: a verify beside the stream, a rebuild between two flushes.
 */
export async function answerBooksRequests(): Promise<void> {
  if (Date.now() >= dailyVerifyAt) {
    await requestBooks(cdcDb, 'verify', { unlessRequested: true });
    dailyVerifyAt = nextVerifyAt();
  }

  const requested = await findBooksRequest(cdcDb);
  // Between two subscriptions the loop settles the books itself. Checked after the read, with nothing awaited before
  // the start: one books operation runs at a time.
  if (!requested || operations > 0 || !replicationState.subscribed) return;

  if (requested === 'rebuild') return rebuildBooks('requested');
  // A verify that started and gave no answer stays asked for, and waits: a recount that cannot finish must not run
  // back to back.
  if (Date.now() - verifyGaveUpAt < rebuildIntervalMs) return;
  if ((await verifyBooks()) !== null) await clearBooksRequest(cdcDb, 'verify');
}

/** Starts the poll for what the worker is asked for: by `pnpm sync:verify`, `pnpm sync:rebuild` or a seed, and by itself once a day. */
export function startBooksSchedule(): void {
  if (scheduleTimer) return;
  scheduleTimer = setInterval(() => {
    void answerBooksRequests().catch((error) => log.warn('Sync books schedule failed', { err: error }));
  }, requestPollMs);
  scheduleTimer.unref?.();
}

/** Ends that poll, at shutdown. A verify or a rebuild that runs is left to finish. */
export function stopBooksSchedule(): void {
  if (scheduleTimer) clearInterval(scheduleTimer);
  scheduleTimer = null;
}
