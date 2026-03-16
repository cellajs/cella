import { jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { maxLength } from '#/db/utils/constraints';

/**
 * Counters for sync sequences and entity/membership counts.
 *
 * One row per context entity (org, project, etc.) keyed by its ID,
 * plus 'public:{entityType}' rows for parentless product entities.
 *
 * - counts: extensible JSONB for entity counts, membership role breakdown,
 *   and entity-type seqs (s:{type} keys, managed by stamp_entity_seq trigger)
 *
 * The stamp_entity_seq trigger increments counts['s:{entityType}'] and stamps entity.seq.
 * Backend reads counts for catchup gap detection and entity count display.
 */
export const contextCountersTable = pgTable('context_counters', {
  contextKey: varchar('context_key', { length: maxLength.id }).primaryKey(),
  counts: jsonb().$type<Record<string, number>>().notNull().default({}),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type ContextCounterModel = typeof contextCountersTable.$inferSelect;
export type InsertContextCounterModel = typeof contextCountersTable.$inferInsert;
