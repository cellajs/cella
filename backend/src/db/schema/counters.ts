import { bigint, index, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Entity-agnostic counters table for high-performance atomic increments.
 *
 * Use cases:
 * - Sequence numbers for CDC activities (gap detection)
 * - Entity counts per organization/project
 * - Usage tracking (storage, API calls, AI tokens)
 * - Rate limiting
 *
 * Key design: namespace:scope:key → value
 * Examples:
 * - seq:org_abc:          → 1542 (activity sequence for org)
 * - count:org_abc:page    → 203  (page count in org)
 * - usage:org_abc:storage → 5GB  (storage bytes)
 */
export const countersTable = pgTable(
  'counters',
  {
    /** Counter category: 'seq', 'count', 'usage', 'rate', etc. */
    namespace: varchar().notNull(),
    /** Scope identifier: orgId, userId, projectId, 'global', etc. */
    scope: varchar().notNull(),
    /** Optional sub-key for granularity: entityType, metric name, etc. */
    key: varchar().notNull().default(''),
    /** Counter value (bigint for large numbers like bytes, timestamps) */
    value: bigint({ mode: 'number' }).notNull().default(0),
    /** Last update timestamp */
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.namespace, table.scope, table.key] }),
    // Index for scope-level queries (get all counters for an org)
    index('counters_scope_idx').on(table.scope),
  ],
);

export type CounterModel = typeof countersTable.$inferSelect;
export type InsertCounterModel = typeof countersTable.$inferInsert;
