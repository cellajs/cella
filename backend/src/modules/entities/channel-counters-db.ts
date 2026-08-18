import { jsonb, snakeCase, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { maxLength } from '#/db/utils/constraints';

/**
 * CDC-maintained summary row per channel entity. `counts` holds sequence, membership, entity,
 * frontier and activity values; `path` lets catchup verify ancestry without another query.
 */
export const channelCountersTable = snakeCase.table('channel_counters', {
  channelKey: varchar('channel_key', { length: maxLength.id }).primaryKey(),
  counts: jsonb().$type<Record<string, number>>().notNull().default({}),
  path: text('path'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type ChannelCounterModel = typeof channelCountersTable.$inferSelect;
export type InsertChannelCounterModel = typeof channelCountersTable.$inferInsert;
