import { integer, jsonb, snakeCase, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { maxLength } from '#/db/utils/constraints';

/** A correction the CDC worker made to one counter key. */
export interface SyncCorrection {
  channelKey: string;
  key: string;
  /** What the counter held, with the changes the count already saw added. */
  stored: number;
  /** What counting from the tables gave. */
  counted: number;
}

/** The snapshot a recount was taken at, kept until the stream has passed it: changes it already saw are not counted twice. */
export interface SyncFence {
  mode: 'verify' | 'rebuild';
  /** `pg_current_snapshot()` of the recount, as text. */
  snapshot: string;
  /** Content of the logical message written right after the snapshot: the stream has passed the recount when it arrives. */
  marker: string;
}

/**
 * The one row that says which generation of the books clients may trust. The CDC worker adds one whenever it corrected
 * or rebuilt them, and a client that holds another generation refetches. Also the worker's mailbox for a verify or a
 * rebuild on request, and where a rebuild keeps its fence across a restart.
 */
export const syncStateTable = snakeCase.table('sync_state', {
  id: varchar({ length: maxLength.field }).primaryKey().default('sync'),
  generation: integer().notNull().default(1),
  requested: varchar({ enum: ['verify', 'rebuild'] }),
  requestedAt: timestamp({ mode: 'string' }),
  verifiedAt: timestamp({ mode: 'string' }),
  rebuiltAt: timestamp({ mode: 'string' }),
  fence: jsonb().$type<SyncFence>(),
});

/** One row for every time the worker found the books wrong or had to rebuild them, so a rare failure leaves a record. */
export const syncIncidentsTable = snakeCase.table('sync_incidents', {
  id: uuid().primaryKey().defaultRandom(),
  createdAt: timestamp({ mode: 'string' }).notNull().defaultNow(),
  /** `verify_corrected`: a verify found differences. `rebuild`: the books were replaced by a count from the tables. */
  kind: varchar({ enum: ['verify_corrected', 'rebuild'] }).notNull(),
  /** `lost_slot`: the replication slot was gone. `lost_counters`: `channel_counters` was empty. `stuck`: a change failed every read. */
  reason: varchar({ enum: ['scheduled', 'requested', 'lost_slot', 'lost_counters', 'stuck'] }).notNull(),
  /** WAL positions the worker gave up between, for a rebuild that skipped a backlog. */
  positionFrom: varchar({ length: maxLength.field }),
  positionTo: varchar({ length: maxLength.field }),
  error: text(),
  corrections: jsonb().$type<SyncCorrection[]>().notNull().default([]),
  generation: integer().notNull(),
});

export type SyncStateModel = typeof syncStateTable.$inferSelect;
export type SyncIncidentModel = typeof syncIncidentsTable.$inferSelect;
