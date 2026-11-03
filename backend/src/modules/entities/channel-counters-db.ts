import { jsonb, snakeCase, varchar } from 'drizzle-orm/pg-core';
import { maxLength } from '#/db/utils/constraints';
import { isoTimestamp } from '#/db/utils/timestamp-columns';

/**
 * CDC-maintained summary row per channel entity. `counts` holds sequence, membership, entity,
 * frontier and activity values.
 */
export const channelCountersTable = snakeCase.table('channel_counters', {
  channelKey: varchar({ length: maxLength.id }).primaryKey(),
  counts: jsonb().$type<Record<string, number>>().notNull().default({}),
  updatedAt: isoTimestamp().defaultNow().notNull(),
});
