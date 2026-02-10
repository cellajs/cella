import { bigint, index, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Entity-agnostic counters for high-performance atomic increments.
 * Key design: namespace:scope:key → value (e.g., seq:org_abc: → 1542).
 * Currently used for CDC sequence tracking (seq namespace).
 */
export const countersTable = pgTable(
  'counters',
  {
    namespace: varchar().notNull(),
    scope: varchar().notNull(),
    key: varchar().notNull().default(''),
    value: bigint({ mode: 'number' }).notNull().default(0),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.namespace, table.scope, table.key] }),
    index('counters_scope_idx').on(table.scope),
  ],
);

export type CounterModel = typeof countersTable.$inferSelect;
export type InsertCounterModel = typeof countersTable.$inferInsert;
