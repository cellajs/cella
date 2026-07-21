import { foreignKey, index, primaryKey, snakeCase, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { tenantIdLength } from '#/db/utils/constraints';
import { usersTable } from '#/modules/user/user-db';

/**
 * Seen-by tracking table for per-user-per-entity view rows.
 *
 * Records when a user has viewed a product entity (e.g., task).
 * Derives unseen counts within a 90-day rolling window.
 *
 * Excluded from CDC like userCountersTable: frequent writes should not
 * generate activities or SSE noise. Excluded from entityTables and resourceTables.
 *
 * Partitioned by created_at with 90-day retention via pg_partman.
 * Composite PK (id, createdAt) required for partitioning.
 * No FKs on organizationId/tenantId: RLS + application logic enforce integrity,
 * and FKs on high-write partitioned tables add unnecessary overhead.
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
    // Dedup lookup: mark-seen inserts via NOT EXISTS on (userId, entityId). A UNIQUE constraint
    // is impossible here because partitioned tables require the partition column (createdAt) in
    // every
    // unique index. Rare concurrent-flush races can leave duplicate rows; readers use
    // EXISTS/NOT EXISTS (dup-safe) and counter recalculation counts DISTINCT users.
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
