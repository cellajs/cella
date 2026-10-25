import { jsonb, snakeCase, text, varchar } from 'drizzle-orm/pg-core';
import { maxLength } from '#/db/utils/constraints';
import { isoTimestamp } from '#/db/utils/timestamp-columns';

/**
 * CDC-maintained summary row per channel entity. `counts` holds sequence, membership, entity,
 * frontier and activity values; `path` lets catchup verify ancestry without another query.
 */
export const channelCountersTable = snakeCase.table('channel_counters', {
  channelKey: varchar({ length: maxLength.id }).primaryKey(),
  counts: jsonb().$type<Record<string, number>>().notNull().default({}),
  path: text(),
  updatedAt: isoTimestamp().defaultNow().notNull(),
});
