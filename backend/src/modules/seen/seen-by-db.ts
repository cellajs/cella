import { foreignKey, index, primaryKey, snakeCase, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { tenantIdLength } from '#/db/utils/constraints';
import { usersTable } from '#/modules/user/user-db';

/**
 * Per-user product views for 90-day unseen-count windows.
 * The high-write table is partitioned, excluded from CDC/entity registries, and uses a composite
 * partition-compatible key. RLS and application logic replace organization/tenant foreign keys.
 */
export const seenByTable = snakeCase.table(
  'seen_by',
  {
    id: uuid().notNull().$defaultFn(generateId),
    userId: uuid().notNull(),
    productId: uuid().notNull(),
    productType: varchar({ enum: appConfig.productEntityTypes }).notNull(),
    /** Parent channel entity ID for grouping (e.g., projectId for tasks). Falls back to organizationId. */
    channelId: uuid().notNull(),
    organizationId: uuid().notNull(),
    tenantId: varchar('tenant_id', { length: tenantIdLength }).notNull(),
    createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    // Composite PK required for partitioning by created_at
    primaryKey({ columns: [table.id, table.createdAt] }),
    // Partitioning prevents a unique user/entity index without the time column.
    // Rare concurrent duplicates are safe because readers use existence and recalculation counts
    // distinct users.
    index('seen_by_user_product_index').on(table.userId, table.productId),
    // Index for unseen count query: COUNT(*) WHERE userId AND channelId AND productType
    index('seen_by_user_channel_type_index').on(table.userId, table.channelId, table.productType),
    // Index for entity-level queries
    index('seen_by_product_id_index').on(table.productId),
    index('seen_by_tenant_id_index').on(table.tenantId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersTable.id],
    }).onDelete('cascade'),
  ],
);

export type SeenByModel = typeof seenByTable.$inferSelect;
export type InsertSeenByModel = typeof seenByTable.$inferInsert;
