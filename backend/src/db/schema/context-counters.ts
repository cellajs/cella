import { bigint, jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { maxLength } from '#/db/utils/constraints';

/**
 * Counters for sync sequences and entity/membership counts.
 *
 * One row per context entity (org, project, etc.) keyed by its ID,
 * plus 'public:{entityType}' rows for org-less product entities.
 *
 * - seq: monotonic counter for product entity changes (create/update/delete)
 * - mSeq: monotonic counter for membership changes
 * - counts: extensible JSONB for entity counts + membership role breakdown
 *
 * Hot-path columns (seq, mSeq) are native integers for O(1) lookup.
 * Flexible counts use JSONB for zero-migration extensibility.
 *
 * CDC worker increments seq/mSeq atomically via upsert.
 * Backend reads for catchup gap detection and entity count display.
 */
export const contextCountersTable = pgTable('context_counters', {
  contextKey: varchar('context_key', { length: maxLength.id }).primaryKey(),
  seq: bigint({ mode: 'number' }).notNull().default(0),
  mSeq: bigint('m_seq', { mode: 'number' }).notNull().default(0),
  counts: jsonb().$type<Record<string, number>>().notNull().default({}),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type ContextCounterModel = typeof contextCountersTable.$inferSelect;
export type InsertContextCounterModel = typeof contextCountersTable.$inferInsert;
