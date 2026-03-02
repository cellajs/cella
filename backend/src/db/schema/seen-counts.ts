import { integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { maxLength } from '#/db/utils/constraints';

/**
 * Denormalized view count per product entity.
 *
 * Stores the number of unique users who have viewed each entity.
 * Incremented atomically when new seenBy records are inserted.
 *
 * NOT tracked by CDC — this is a derived counter, not a source entity.
 */
export const seenCountsTable = pgTable('seen_counts', {
  entityId: varchar({ length: maxLength.id }).notNull().primaryKey(),
  entityType: varchar({ enum: appConfig.productEntityTypes }).notNull(),
  viewCount: integer().notNull().default(0),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export type SeenCountModel = typeof seenCountsTable.$inferSelect;
export type InsertSeenCountModel = typeof seenCountsTable.$inferInsert;
