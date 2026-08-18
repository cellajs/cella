import { integer, snakeCase, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';

/** Unique viewers per product, counted from seen_by and upserted on mark-seen events. */
export const productCountersTable = snakeCase.table('product_counters', {
  productId: uuid().notNull().primaryKey(),
  productType: varchar({ enum: appConfig.productEntityTypes }).notNull(),
  viewCount: integer().notNull().default(0),
  lastViewedAt: timestamp('last_viewed_at', { mode: 'string' }),
});

export type ProductCounterModel = typeof productCountersTable.$inferSelect;
export type InsertProductCounterModel = typeof productCountersTable.$inferInsert;
