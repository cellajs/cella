import { jsonb, snakeCase, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { maxLength } from '#/db/utils/constraints';

/**
 * Counters for sync sequences and entity/membership counts.
 *
 * One row per channel entity (org, project, etc.) keyed by its ID,
 *
 * - counts: extensible JSONB — s:ledger/s:membership, f:/fs: frontiers,
 *   e:/es: counts, m: membership breakdown, li:/lu: activity stamps
 * - path: the channel's canonical id-path (CDC-maintained copy of the channel row's
 *   generated column; recalc backfills). Makes the summary row self-describing so
 *   catchup verifies claimed view ancestry with no extra query.
 *
 * The CDC worker maintains counts and path after processing WAL events. Backend reads
 * them for catchup view answers and entity count display.
 */
export const channelCountersTable = snakeCase.table('channel_counters', {
  channelKey: varchar('channel_key', { length: maxLength.id }).primaryKey(),
  counts: jsonb().$type<Record<string, number>>().notNull().default({}),
  path: text('path'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type ChannelCounterModel = typeof channelCountersTable.$inferSelect;
export type InsertChannelCounterModel = typeof channelCountersTable.$inferInsert;
