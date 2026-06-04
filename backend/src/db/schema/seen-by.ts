import { foreignKey, index, primaryKey, snakeCase, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { generateId } from 'shared/entity-id';
import { tenantIdLength } from '#/db/utils/constraints';
import { usersTable } from './users';

/**
 * Seen-by tracking table for per-user-per-entity view records.
 *
 * Records when a user has viewed a product entity (e.g., task).
 * Used to derive unseen counts within a 90-day rolling window.
 *
 * NOT tracked by CDC — like userCountersTable, frequent writes should not
 * generate activities or SSE noise. Excluded from entityTables and resourceTables.
 *
 * Partitioned by created_at with 90-day retention via pg_partman.
 * Composite PK (id, createdAt) required for partitioning.
 * No FKs on organizationId/tenantId — RLS + application logic enforce integrity,
 * and FKs on high-write partitioned tables add unnecessary overhead.
 */
export const seenByTable = snakeCase.table(
  'seen_by',
  {
    id: uuid().notNull().$defaultFn(generateId),
    userId: uuid().notNull(),
    entityId: uuid().notNull(),
    entityType: varchar({ enum: appConfig.productEntityTypes }).notNull(),
    /** Parent context entity ID for grouping (e.g., projectId for tasks). Falls back to organizationId. */
    contextId: uuid().notNull(),
    organizationId: uuid().notNull(),
    tenantId: varchar('tenant_id', { length: tenantIdLength }).notNull(),
    createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    // Composite PK required for partitioning by created_at
    primaryKey({ columns: [table.id, table.createdAt] }),
    // Deduplication: one record per user per entity
    unique('seen_by_user_entity_unique').on(table.userId, table.entityId),
    // Index for unseen count query: COUNT(*) WHERE userId AND contextId AND entityType
    index('seen_by_user_context_type_index').on(table.userId, table.contextId, table.entityType),
    // Index for entity-level queries
    index('seen_by_entity_id_index').on(table.entityId),
    index('seen_by_tenant_id_index').on(table.tenantId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersTable.id],
    }).onDelete('cascade'),
  ],
);

export type SeenByModel = typeof seenByTable.$inferSelect;
export type InsertSeenByModel = typeof seenByTable.$inferInsert;
