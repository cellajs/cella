import { integer, snakeCase, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';

/**
 * Denormalized view counters per product entity.
 *
 * Tracks view counts (unique users who viewed via seen_by).
 * Incremented atomically via UPSERT when mark-seen events occur.
 */
export const productCountersTable = snakeCase.table('product_counters', {
  productId: uuid().notNull().primaryKey(),
  productType: varchar({ enum: appConfig.productEntityTypes }).notNull(),
  viewCount: integer().notNull().default(0),
  lastViewedAt: timestamp('last_viewed_at', { mode: 'string' }),
});

export type ProductCounterModel = typeof productCountersTable.$inferSelect;
export type InsertProductCounterModel = typeof productCountersTable.$inferInsert;
