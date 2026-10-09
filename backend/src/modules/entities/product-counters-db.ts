import { integer, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';

/** Unique viewers per product, counted from seen_by and upserted on mark-seen events. */
export const productCountersTable = snakeCase.table('product_counters', {
  productId: uuid().notNull().primaryKey(),
  productType: varchar({ enum: appConfig.productEntityTypes }).notNull(),
  viewCount: integer().notNull().default(0),
});
