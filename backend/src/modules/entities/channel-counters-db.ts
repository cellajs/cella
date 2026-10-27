import { jsonb, snakeCase, text, varchar } from 'drizzle-orm/pg-core';
import { maxLength } from '#/db/utils/constraints';
import { isoTimestamp } from '#/db/utils/timestamp-columns';

/**
 * CDC-maintained summary row per channel entity. `counts` holds sequence, membership, entity,
 * frontier and activity values.
 */
export const channelCountersTable = snakeCase.table('channel_counters', {
  channelKey: varchar({ length: maxLength.id }).primaryKey(),
  counts: jsonb().$type<Record<string, number>>().notNull().default({}),
  /** The channel's canonical id path, kept by CDC: catchup verifies a claimed view's ancestry against it without another query. */
  path: text(),
  updatedAt: isoTimestamp().defaultNow().notNull(),
});
