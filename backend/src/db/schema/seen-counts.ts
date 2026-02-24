import { integer, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { maxLength } from '#/db/utils/constraints';

/**
 * Denormalized view count per product entity.
 *
 * Stores the number of unique users who have viewed each entity.
 * Incremented atomically when new seenBy records are inserted.
 *
 * NOT tracked by CDC — this is a derived counter, not a source entity.
 *
 * PARTITIONING: Partitioned by entityCreatedAt via pg_partman (weekly, 90-day retention).
 * Aligns with seenBy retention — both tables drop data for entities older than 90 days.
 * Drizzle sees a regular table; PostgreSQL manages partitions transparently.
 */
export const seenCountsTable = pgTable(
  'seen_counts',
  {
    entityId: varchar({ length: maxLength.id }).notNull(),
    entityType: varchar({ enum: appConfig.productEntityTypes }).notNull(),
    viewCount: integer().notNull().default(0),
    entityCreatedAt: timestamp('entity_created_at', { mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    // Composite PK required for pg_partman range partitioning on entityCreatedAt
    primaryKey({ columns: [table.entityId, table.entityCreatedAt] }),
  ],
);

export type SeenCountModel = typeof seenCountsTable.$inferSelect;
export type InsertSeenCountModel = typeof seenCountsTable.$inferInsert;
