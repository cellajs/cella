import { integer, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';

/** Unique viewers per product: a mark-seen adds one for a user's first view, and a seed recounts them from `seen_by`. */
export const productCountersTable = snakeCase.table('product_counters', {
  productId: uuid().notNull().primaryKey(),
  productType: varchar({ enum: appConfig.productEntityTypes }).notNull(),
  viewCount: integer().notNull().default(0),
});
