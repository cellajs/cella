import { foreignKey, index, primaryKey, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { tenantIdLength } from '#/db/utils/constraints';
import { isoTimestampWithoutZone } from '#/db/utils/timestamp-columns';
import { usersTable } from '#/modules/user/user-db';

/**
 * Per-user product views inside the seen window (`seenWindowMs`). Partitioned, excluded from CDC, composite key; no
 * RLS, and `user_id` is its only foreign key.
 */
export const seenByTable = snakeCase.table(
  'seen_by',
  {
    id: uuid().notNull().$defaultFn(generateId),
    userId: uuid().notNull(),
    productId: uuid().notNull(),
    productType: varchar({ enum: appConfig.productEntityTypes }).notNull(),
    /** The product's home channel: its deepest channel, else the organization. */
    channelId: uuid().notNull(),
    organizationId: uuid().notNull(),
    tenantId: varchar({ length: tenantIdLength }).notNull(),
    createdAt: isoTimestampWithoutZone().defaultNow().notNull(),
  },
  (table) => [
    // Composite PK required for partitioning by created_at
    primaryKey({ columns: [table.id, table.createdAt] }),
    // Partitioning prevents a unique user/product index: `insertSeenBy` keeps one row per user and product itself.
    index('seen_by_user_product_index').on(table.userId, table.productId),
    index('seen_by_user_channel_type_index').on(table.userId, table.channelId, table.productType),
    index('seen_by_product_id_index').on(table.productId),
    index('seen_by_tenant_id_index').on(table.tenantId),
    foreignKey({ columns: [table.userId], foreignColumns: [usersTable.id] }).onDelete('cascade'),
  ],
);

export type SeenByModel = typeof seenByTable.$inferSelect;
export type InsertSeenByModel = typeof seenByTable.$inferInsert;
