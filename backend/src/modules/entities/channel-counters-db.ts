import { jsonb, snakeCase, timestamp, varchar } from 'drizzle-orm/pg-core';
import { maxLength } from '#/db/utils/constraints';

/**
 * Counters for sync sequences and entity/membership counts.
 *
 * One row per context entity (org, project, etc.) keyed by its ID,
 *
 * - counts: extensible JSONB for entity counts, membership role breakdown,
 *   and entity-type seqs (s:{type} keys, managed by the CDC worker)
 *
 * The CDC worker increments counts['s:{entityType}'] and stamps entity.seq after processing WAL events.
 * Backend reads counts for catchup gap detection and entity count display.
 */
export const channelCountersTable = snakeCase.table('channel_counters', {
  channelKey: varchar('channel_key', { length: maxLength.id }).primaryKey(),
  counts: jsonb().$type<Record<string, number>>().notNull().default({}),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type ChannelCounterModel = typeof channelCountersTable.$inferSelect;
export type InsertChannelCounterModel = typeof channelCountersTable.$inferInsert;
