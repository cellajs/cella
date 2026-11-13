import { integer, jsonb, snakeCase, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { maxLength } from '#/db/utils/constraints';
import { isoTimestamp } from '#/db/utils/timestamp-columns';

/** The id of the one row of `sync_state`. */
export const syncStateId = 'sync';

/** One counter key on which a verify found the books to differ from the tables. */
export interface SyncCorrection {
  channelKey: string;
  key: string;
  /** What the counter held, with the changes the recount already saw added. */
  stored: number;
  /** What the recount from the tables gave. */
  counted: number;
}

/** The fence of a rebuild the stream has not passed yet. A worker that finds one at its start was interrupted inside it, and rebuilds again. */
export interface SyncFence {
  /** Content of the logical message written right after the rebuild's snapshot: the stream has passed the rebuild when it arrives. */
  marker: string;
}

/**
 * The one row that says which generation of the books clients may trust. The CDC worker moves it on whenever it
 * rebuilt them, and a client that holds another generation refetches. A generation only tells two states of the books
 * apart: it grows, never below the clock in minutes, and counts nothing. Also the worker's mailbox for a verify or a
 * rebuild on request, and where a rebuild keeps its marker until the stream has passed it.
 */
export const syncStateTable = snakeCase.table('sync_state', {
  id: varchar({ length: maxLength.field }).primaryKey().default(syncStateId),
  generation: integer().notNull().default(1),
  requested: varchar({ enum: ['verify', 'rebuild'] }),
  /** When the worker last answered the request in `requested`, one waiting at a time; a rebuild's own moment is its incident. */
  answeredAt: isoTimestamp(),
  fence: jsonb().$type<SyncFence>(),
});

/** One row for every time the worker rebuilt the books from the tables, so a rare failure leaves a record. */
export const syncIncidentsTable = snakeCase.table('sync_incidents', {
  id: uuid().primaryKey().defaultRandom(),
  createdAt: isoTimestamp().notNull().defaultNow(),
  /**
   * `requested`: somebody asked for it. `lost_slot`: the replication slot was gone, or dropped at the WAL bound.
   * `lost_counters`: `channel_counters` was empty. `wrong_books`: a verify found the differences in `corrections`.
   * `interrupted`: the worker restarted before the stream had passed a rebuild. `bulk_write`: a transaction the worker
   * discarded, declared by its marker (`error` holds the label, `migrate:<name>` for a migration) or past its size
   * limit (`oversized:<count>`).
   */
  reason: varchar({ enum: ['requested', 'lost_slot', 'lost_counters', 'wrong_books', 'interrupted', 'bulk_write'] }).notNull(),
  /** For a lost slot, the failure the worker read again from: its position (null for a subscription that failed) and its error. */
  positionFrom: varchar({ length: maxLength.field }),
  error: text(),
  corrections: jsonb().$type<SyncCorrection[]>().notNull().default([]),
  generation: integer().notNull(),
});
