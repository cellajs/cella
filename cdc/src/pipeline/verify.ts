import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import { computeChannelCounters, isForwardOnlyCounterKey, recalculateCounters } from '#/modules/entities/counters-queries';
import { type SyncCorrection, type SyncFence, syncIncidentsTable, syncStateTable } from '#/modules/entities/sync-state-db';
import { CDC_SLOT_NAME, RESOURCE_LIMITS } from '../constants';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import { pushHealth } from '../network/health-reporter';
import { type CounterDeltas, fence, isPlainCountKey } from '../services/fence';
import { replicationState } from '../services/replication-state';
import { applyCounterDeltas } from '../utils/apply-unified-deltas';
import { FENCE_MARKER_PREFIX, runBetweenFlushes } from './handle-message';

const { countTimeoutMs, passTimeoutMs, rebuildIntervalMs, verifyHourUtc, requestPollMs } = RESOURCE_LIMITS.books;

type Counters = Map<string, Record<string, number>>;
type Executor = Pick<typeof cdcDb, 'execute'>;
type Transaction = Parameters<Parameters<typeof cdcDb.transaction>[0]>[0];

const STATE_ID = 'sync';

/**
 * Compares the stored counters with a count from the tables taken at one snapshot. A plain count must equal what was
 * stored at the snapshot plus the changes the count already saw and the worker recorded later. The sequence counter
 * and a frontier may be ahead of the tables (values handed out to rows deleted since) but never behind them. Only
 * channels the count yields are compared: a counter row of a channel that is gone is nobody's book.
 * @returns One correction per key that is wrong; empty when the books are right.
 */
export function compareBooks(stored: Counters, counted: Counters, alreadyCounted: CounterDeltas): SyncCorrection[] {
  const corrections: SyncCorrection[] = [];
  for (const [channelKey, countedCounts] of counted) {
    const storedCounts = stored.get(channelKey) ?? {};
    const seenCounts = alreadyCounted.get(channelKey) ?? {};
    for (const key of new Set([...Object.keys(countedCounts), ...Object.keys(storedCounts)])) {
      const countedValue = Number(countedCounts[key] ?? 0);
      if (isForwardOnlyCounterKey(key)) {
        const storedValue = Number(storedCounts[key] ?? 0);
        if (countedValue > storedValue) corrections.push({ channelKey, key, stored: storedValue, counted: countedValue });
      } else if (isPlainCountKey(key)) {
        const expected = Number(storedCounts[key] ?? 0) + (seenCounts[key] ?? 0);
        if (expected !== countedValue) corrections.push({ channelKey, key, stored: expected, counted: countedValue });
      }
    }
  }
  return corrections;
}

async function readStoredCounters(db: Executor): Promise<Counters> {
  const rows = await db.execute<{ channel_key: string; counts: Record<string, number> }>(sql`SELECT channel_key, counts FROM channel_counters`);
  return new Map(rows.rows.map((row) => [row.channel_key, row.counts]));
}

/**
 * Writes the logical message that tells the stream it has passed a snapshot. Not transactional, so it sits at its own
 * position in the WAL.
 * @returns That position.
 */
async function emitMarker(marker: string): Promise<string> {
  const result = await cdcDb.execute<{ lsn: string }>(sql`SELECT pg_logical_emit_message(false, ${FENCE_MARKER_PREFIX}, ${marker})::text AS lsn`);
  return result.rows[0].lsn;
}

type IncidentKind = 'verify_corrected' | 'rebuild';
type IncidentReason = 'scheduled' | 'requested' | 'lost_slot' | 'lost_counters' | 'stuck';

interface IncidentDetails {
  positionFrom?: string | null;
  positionTo?: string | null;
  error?: string | null;
  corrections?: SyncCorrection[];
}

/**
 * The next generation: one more, and never below the clock in minutes. A database restored from a backup holds an
 * older number, and its next one must not be a number some client already holds.
 */
const nextGeneration = sql`GREATEST(${syncStateTable.generation} + 1, floor(extract(epoch FROM now()) / 60)::int)`;

/**
 * What every correction and every rebuild leaves in the database: the next generation, which makes every client
 * refetch, and a row in `sync_incidents`. Written in the transaction that changes the books, so the books never
 * change without it.
 * @returns The new generation.
 */
async function writeIncident(tx: Transaction, kind: IncidentKind, reason: IncidentReason, details: IncidentDetails): Promise<number> {
  await tx.insert(syncStateTable).values({ id: STATE_ID }).onConflictDoNothing();
  const [state] = await tx
    .update(syncStateTable)
    .set({ generation: nextGeneration, ...(kind === 'rebuild' ? { rebuiltAt: sql`now()` } : {}) })
    .where(eq(syncStateTable.id, STATE_ID))
    .returning({ generation: syncStateTable.generation });
  await tx.insert(syncIncidentsTable).values({ kind, reason, ...details, generation: state.generation });
  return state.generation;
}

/** After that transaction committed: health carries the generation to the API, and the log gets its error, so a rare failure is not missed. */
function announceIncident(kind: IncidentKind, reason: IncidentReason, generation: number, details: IncidentDetails): void {
  replicationState.generation = generation;
  pushHealth();
  log.error(kind === 'rebuild' ? 'Sync books rebuilt from the tables: clients refetch' : 'Sync books were wrong and are corrected: clients refetch', {
    reason,
    generation,
    ...details,
    corrections: details.corrections?.slice(0, 20),
    correctionCount: details.corrections?.length ?? 0,
  });
}

/**
 * Applies corrections as deltas, so changes recorded since the comparison stay counted, and records the incident
 * with them.
 * @returns The new generation.
 */
async function applyCorrections(corrections: SyncCorrection[], reason: IncidentReason): Promise<number> {
  const byChannel = new Map<string, Record<string, number>>();
  for (const { channelKey, key, stored, counted } of corrections) {
    const deltas = byChannel.get(channelKey) ?? {};
    // A frontier merges as a maximum in `apply_count_deltas`; the sequence counter and a plain count are added to.
    deltas[key] = key.startsWith('e:f:') ? counted : counted - stored;
    byChannel.set(channelKey, deltas);
  }
  return cdcDb.transaction(async (tx) => {
    for (const [channelKey, deltas] of [...byChannel].sort(([a], [b]) => a.localeCompare(b))) await applyCounterDeltas(tx, channelKey, deltas);
    return writeIncident(tx, 'verify_corrected', reason, { corrections });
  });
}

let verifying = false;

/**
 * Checks the books against the tables while the worker reads on. The snapshot is taken exactly between two flushes;
 * the counting runs beside the stream, and the comparison waits until the stream has passed the snapshot. When the
 * books are right nothing is written. When they are wrong, each key is corrected by its difference.
 * @param reason - Whether the daily schedule or a request started it.
 * @returns The corrections made (empty when the books were right), or null when it could not run or finish.
 */
export async function verifyBooks(reason: 'scheduled' | 'requested'): Promise<SyncCorrection[] | null> {
  if (verifying || fence.mode || replicationState.status !== 'active') return null;
  verifying = true;
  const marker = randomUUID();
  let stored: Counters = new Map();
  let counted: Counters = new Map();
  let counting: Promise<void> = Promise.resolve();

  try {
    await runBetweenFlushes(
      () =>
        new Promise<void>((taken, failed) => {
          counting = cdcDb.transaction(
            async (tx) => {
              // The first query of a REPEATABLE READ transaction fixes its snapshot: everything below is read as of it.
              const snapshot = (await tx.execute<{ snapshot: string }>(sql`SELECT pg_current_snapshot()::text AS snapshot`)).rows[0].snapshot;
              await emitMarker(marker);
              fence.open('verify', snapshot, marker);
              taken();
              await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${countTimeoutMs}`));
              stored = await readStoredCounters(tx);
              counted = await computeChannelCounters({ var: { db: tx } });
            },
            { isolationLevel: 'repeatable read' },
          );
          counting.catch(failed);
        }),
    );

    const passed = await Promise.race([
      Promise.all([counting, fence.whenPassed()]).then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), passTimeoutMs).unref?.()),
    ]);
    if (!passed) {
      log.warn('Verify abandoned: the stream did not reach the count in time', { reason });
      return null;
    }

    const corrections = compareBooks(stored, counted, fence.close());
    if (corrections.length > 0) {
      const generation = await runBetweenFlushes(() => applyCorrections(corrections, reason));
      announceIncident('verify_corrected', reason, generation, { corrections });
    }
    await cdcDb.insert(syncStateTable).values({ id: STATE_ID }).onConflictDoNothing();
    await cdcDb.update(syncStateTable).set({ verifiedAt: sql`now()` }).where(eq(syncStateTable.id, STATE_ID));
    log.info('Sync books verified', { reason, channels: counted.size, corrections: corrections.length });
    return corrections;
  } catch (error) {
    log.warn('Verify failed: nothing was changed', { err: error, reason });
    return null;
  } finally {
    if (fence.mode === 'verify') fence.close();
    verifying = false;
  }
}

/** Closes a rebuild's fence once the stream has passed its snapshot, and forgets it in the database. */
function closeFenceWhenPassed(): void {
  void fence
    .whenPassed()
    .then(async () => {
      fence.close();
      await cdcDb.update(syncStateTable).set({ fence: null }).where(eq(syncStateTable.id, STATE_ID));
      log.info('The stream has passed the rebuild: every change counts again');
    })
    .catch((error) => log.warn('Could not clear the rebuild fence', { err: error }));
}

/**
 * The lost case: the books are replaced by a count from the tables, and every client refetches. Runs between two
 * subscriptions. The count is taken at a snapshot, and until the stream has passed it, a transaction the count
 * already saw adds nothing to the plain counts. The new counters, the fence, the incident and the next generation are
 * one transaction: a worker that dies leaves either all of it or none.
 * @param reason - Why the books count as lost.
 * @param backlog - Set for a worker stuck on a change: the slot moves to the current position first, which gives up
 *   everything it had not recorded.
 */
export async function rebuildBooks(reason: Exclude<IncidentReason, 'scheduled'>, backlog?: { position: string; error: string }): Promise<void> {
  let positionTo: string | null = null;
  if (backlog) {
    // Moving the slot is no part of any transaction. The request is written first, so a worker that dies between
    // the move and the rebuild finds it at its next start and rebuilds then.
    await cdcDb
      .insert(syncStateTable)
      .values({ id: STATE_ID, requested: 'rebuild', requestedAt: sql`now()` })
      .onConflictDoUpdate({ target: syncStateTable.id, set: { requested: 'rebuild', requestedAt: sql`now()` } });
    const advanced = await cdcDb.execute<{ position: string }>(
      sql`SELECT (pg_replication_slot_advance(${CDC_SLOT_NAME}, pg_current_wal_lsn())).end_lsn::text AS position`,
    );
    positionTo = advanced.rows[0]?.position ?? null;
  }

  const marker = randomUUID();
  const details = { positionFrom: backlog?.position ?? null, positionTo, error: backlog?.error ?? null };
  let snapshot = '';
  const generation = await cdcDb.transaction(
    async (tx) => {
      snapshot = (await tx.execute<{ snapshot: string }>(sql`SELECT pg_current_snapshot()::text AS snapshot`)).rows[0].snapshot;
      const markerLsn = await emitMarker(marker);
      await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${countTimeoutMs}`));
      // A plain count the tables no longer give a row for is zero, not what it was.
      await tx.execute(sql`
        UPDATE channel_counters SET counts = counts || (
          SELECT COALESCE(jsonb_object_agg(k, 0), '{}'::jsonb) FROM jsonb_object_keys(counts) k WHERE k LIKE 'e:c:%' OR k LIKE 'm:c:%'
        )
      `);
      await recalculateCounters({ var: { db: tx } });
      const next = await writeIncident(tx, 'rebuild', reason, details);
      // A rebuild answers a request for one, whatever started it.
      const kept: SyncFence = { mode: 'rebuild', snapshot, marker, markerLsn };
      await tx.update(syncStateTable).set({ fence: kept, requested: null }).where(eq(syncStateTable.id, STATE_ID));
      return next;
    },
    { isolationLevel: 'repeatable read' },
  );

  fence.open('rebuild', snapshot, marker);
  closeFenceWhenPassed();
  announceIncident('rebuild', reason, generation, details);
  lastRebuildAt = Date.now();
  replicationState.rebuildRequested = false;
  replicationState.clearFailure();
}

let lastRebuildAt = 0;

/** A fault that repeats costs one rebuild and one refetch per interval, not one per failing change. */
export const rebuildAllowed = (): boolean => Date.now() - lastRebuildAt >= rebuildIntervalMs;

/**
 * Whether the slot has confirmed a position at or past a fence's marker. Then every transaction the count saw is
 * recorded, and the marker itself never arrives again: the worker died between acknowledging it and forgetting the fence.
 */
async function slotIsPast(markerLsn: string | undefined): Promise<boolean> {
  if (!markerLsn) return false;
  const result = await cdcDb.execute<{ passed: boolean }>(
    sql`SELECT confirmed_flush_lsn >= ${markerLsn}::pg_lsn AS passed FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`,
  );
  return result.rows[0]?.passed === true;
}

/**
 * Reads the sync state when the worker starts: the generation health reports, when the last rebuild was, and a
 * rebuild's fence that a restart interrupted.
 */
export async function restoreBooksState(): Promise<void> {
  const [state] = await cdcDb.select().from(syncStateTable).where(eq(syncStateTable.id, STATE_ID));
  replicationState.generation = state?.generation ?? 1;
  if (state?.rebuiltAt) lastRebuildAt = new Date(`${state.rebuiltAt}Z`).getTime();
  if (state?.fence?.mode !== 'rebuild' || fence.mode) return;

  if (await slotIsPast(state.fence.markerLsn)) {
    await cdcDb.update(syncStateTable).set({ fence: null }).where(eq(syncStateTable.id, STATE_ID));
    log.info('The stream had passed the rebuild before the restart: its fence is forgotten');
    return;
  }
  fence.open('rebuild', state.fence.snapshot, state.fence.marker);
  closeFenceWhenPassed();
}

/**
 * Whether a rebuild is asked for, read from the database: by `pnpm sync:rebuild`, or by a worker that gave up a
 * backlog and died before it rebuilt. Also lets the schedule end a subscription for the next request.
 */
export async function rebuildIsRequested(): Promise<boolean> {
  replicationState.rebuildRequested = false;
  const [state] = await cdcDb.select({ requested: syncStateTable.requested }).from(syncStateTable).where(eq(syncStateTable.id, STATE_ID));
  return state?.requested === 'rebuild';
}

/** Whether the counters are gone while the database has a history: a truncate or a partial restore emptied the table. */
export async function countersAreLost(): Promise<boolean> {
  const result = await cdcDb.execute<{ counters: boolean; history: boolean }>(
    sql`SELECT EXISTS (SELECT 1 FROM ${channelCountersTable}) AS counters, EXISTS (SELECT 1 FROM activities) AS history`,
  );
  return result.rows[0].history && !result.rows[0].counters;
}

/** Whether the database has a history at all: a slot made on one that has none loses nothing. */
export async function hasHistory(): Promise<boolean> {
  return (await cdcDb.execute<{ history: boolean }>(sql`SELECT EXISTS (SELECT 1 FROM activities) AS history`)).rows[0].history;
}

/** The next time the clock shows the verify hour, in epoch ms. */
function nextVerifyAt(now = Date.now()): number {
  const next = new Date(now);
  next.setUTCHours(verifyHourUtc, 0, 0, 0);
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime();
}

let scheduleTimer: NodeJS.Timeout | null = null;

/**
 * Verifies once a day, and picks up a verify or a rebuild that `pnpm sync:verify` or `pnpm sync:rebuild` asked for.
 * A rebuild runs between two subscriptions, so a request for one ends the subscription the worker holds.
 */
export function startBooksSchedule(): void {
  if (scheduleTimer) return;
  let dailyAt = nextVerifyAt();
  scheduleTimer = setInterval(() => {
    void (async () => {
      if (Date.now() >= dailyAt) {
        dailyAt = nextVerifyAt();
        await verifyBooks('scheduled');
      }
      const [state] = await cdcDb.select({ requested: syncStateTable.requested }).from(syncStateTable).where(eq(syncStateTable.id, STATE_ID));
      if (!state?.requested) return;
      if (state.requested === 'verify') {
        if ((await verifyBooks('requested')) !== null)
          await cdcDb.update(syncStateTable).set({ requested: null }).where(eq(syncStateTable.id, STATE_ID));
      } else if (!replicationState.rebuildRequested) {
        replicationState.rebuildRequested = true;
        await replicationState.service?.stop();
      }
    })().catch((error) => log.warn('Sync books schedule failed', { err: error }));
  }, requestPollMs);
  scheduleTimer.unref?.();
}

export function stopBooksSchedule(): void {
  if (scheduleTimer) clearInterval(scheduleTimer);
  scheduleTimer = null;
}
