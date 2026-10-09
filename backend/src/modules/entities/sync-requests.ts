import { setTimeout as sleep } from 'node:timers/promises';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { DbOrTx } from '#/db/create-connection';
import { type SyncCorrection, syncIncidentsTable, syncStateId, syncStateTable } from '#/modules/entities/sync-state-db';

/** What the CDC worker can be asked for: to verify its books against the tables, or to rebuild them from the tables. */
export type BooksRequest = NonNullable<typeof syncStateTable.$inferSelect.requested>;

/** The worker's answer to a request. */
export interface BooksAnswer {
  /** False when the worker stamped nothing within the wait: it is not running, or it reads no stream. */
  answered: boolean;
  /** What a verify found different from the tables. The worker has rebuilt the books for it. Empty for right books, and for a rebuild. */
  differences: SyncCorrection[];
  /** The generation of the books after the answer. */
  generation: number;
}

/** How often a waiting caller looks for the answer. */
const ANSWER_POLL_MS = 500;

/**
 * Asks the CDC worker to verify its books or to rebuild them, by writing the request into `sync_state`. A worker that
 * reads the stream finds it within seconds; a rebuild is also found by a worker at its next start.
 * @param db - A connection that may write `sync_state`: the worker's own, or an admin one.
 * @param request - What to ask for.
 * @param options - `unlessRequested` leaves a request that already waits as it is.
 * @returns The database's clock right before the request was written: whatever the worker stamps after it is its answer.
 */
export const requestBooks = async (db: DbOrTx, request: BooksRequest, { unlessRequested = false } = {}): Promise<string> => {
  const [{ since }] = (await db.execute<{ since: string }>(sql`SELECT clock_timestamp()::timestamp::text AS since`)).rows;
  await db
    .insert(syncStateTable)
    .values({ id: syncStateId, requested: request })
    .onConflictDoUpdate({
      target: syncStateTable.id,
      set: { requested: request },
      setWhere: unlessRequested ? isNull(syncStateTable.requested) : undefined,
    });
  return since;
};

/**
 * The request that waits for the worker.
 * @param db - A connection that may read `sync_state`.
 * @returns The request, or null when nothing is asked for.
 */
export const findBooksRequest = async (db: DbOrTx): Promise<BooksRequest | null> => {
  const [state] = await db.select({ requested: syncStateTable.requested }).from(syncStateTable).where(eq(syncStateTable.id, syncStateId));
  return state?.requested ?? null;
};

/**
 * Takes a request out of `sync_state` once it is answered or given up. A request of the other kind, written since,
 * stays.
 * @param db - A connection or transaction that may write `sync_state`.
 * @param request - The request that is over.
 * @returns Nothing.
 */
export const clearBooksRequest = async (db: DbOrTx, request: BooksRequest): Promise<void> => {
  await db
    .update(syncStateTable)
    .set({ requested: null })
    .where(and(eq(syncStateTable.id, syncStateId), eq(syncStateTable.requested, request)));
};

/**
 * Waits until the worker has answered a request: it stamps `verified_at` after a verify and `rebuilt_at` with a
 * rebuild. A verify that finds the books wrong ends in a rebuild, whose incident lists what differed. A request nobody
 * answered in time is taken back, so it does not run later with nobody waiting for it.
 * @param db - The connection the request was written on.
 * @param request - What was asked for.
 * @param since - What `requestBooks` returned.
 * @param waitSeconds - How long to wait for the answer.
 * @returns Whether the worker answered, what a verify found different, and the generation of the books.
 */
export const awaitBooksAnswer = async (db: DbOrTx, request: BooksRequest, since: string, waitSeconds: number): Promise<BooksAnswer> => {
  const answeredAt = request === 'verify' ? syncStateTable.verifiedAt : syncStateTable.rebuiltAt;
  const deadline = Date.now() + waitSeconds * 1000;
  let generation = 1;

  while (true) {
    const [state] = await db
      .select({ generation: syncStateTable.generation, answered: sql<boolean>`coalesce(${gt(answeredAt, since)}, false)` })
      .from(syncStateTable)
      .where(eq(syncStateTable.id, syncStateId));
    generation = state?.generation ?? generation;

    if (state?.answered) {
      if (request === 'rebuild') return { answered: true, differences: [], generation };
      const incidents = await db
        .select({ corrections: syncIncidentsTable.corrections })
        .from(syncIncidentsTable)
        .where(and(gt(syncIncidentsTable.createdAt, since), eq(syncIncidentsTable.reason, 'wrong_books')))
        .orderBy(syncIncidentsTable.createdAt);
      return { answered: true, differences: incidents.flatMap((incident) => incident.corrections), generation };
    }

    if (Date.now() >= deadline) break;
    await sleep(ANSWER_POLL_MS);
  }

  await clearBooksRequest(db, request);
  return { answered: false, differences: [], generation };
};
