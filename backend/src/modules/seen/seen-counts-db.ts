import { integer, snakeCase, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';

/**
 * Denormalized view count per product entity.
 *
 * Stores the number of unique users who have viewed each entity.
 * Incremented atomically when new seenBy records are inserted.
 *
 * NOT tracked by CDC — this is a derived counter, not a source entity.
 */
export const seenCountsTable = snakeCase.table('seen_counts', {
  entityId: uuid().notNull().primaryKey(),
  entityType: varchar({ enum: appConfig.productEntityTypes }).notNull(),
  viewCount: integer().notNull().default(0),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export type SeenCountModel = typeof seenCountsTable.$inferSelect;
export type InsertSeenCountModel = typeof seenCountsTable.$inferInsert;
