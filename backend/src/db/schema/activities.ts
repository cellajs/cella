import { sql } from 'drizzle-orm';
import { foreignKey, index, integer, jsonb, pgTable, primaryKey, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import type { ActivityError } from '#/db/utils/activity-error-schema';
import {
  generateActivityContextColumns,
  generateActivityContextForeignKeys,
  generateActivityContextIndexes,
} from '#/db/utils/generate-activity-context-columns';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import type { StxBase } from '#/schemas/stx-base-schema';
import { activityActions } from '#/sync/activity-bus';
import { nanoid } from '#/utils/nanoid';
import { organizationsTable } from './organizations';
import { tenantsTable } from './tenants';
import { usersTable } from './users';

/**
 * Activities table for Change Data Capture (CDC).
 * Tracks create, update, and delete operations across all resources.
 *
 * PARTITIONING: Partitioned by createdAt via pg_partman (weekly, 90-day retention).
 * Drizzle sees a regular table; PostgreSQL manages partitions transparently.
 *
 * RLS: Privilege-based (no policies). runtime_role: SELECT only, cdc_role: INSERT only.
 */
export const activitiesTable = pgTable(
  'activities',
  {
    id: varchar().notNull().$defaultFn(nanoid),
    tenantId: varchar('tenant_id', { length: 24 }).references(() => tenantsTable.id),
    userId: varchar(),
    entityType: varchar({ enum: appConfig.entityTypes }),
    resourceType: varchar({ enum: appConfig.resourceTypes }),
    action: varchar({ enum: activityActions }).notNull(),
    tableName: varchar().notNull(),
    type: varchar().notNull(),
    entityId: varchar(),
    ...generateActivityContextColumns(),
    createdAt: timestampColumns.createdAt,
    changedKeys: jsonb().$type<string[]>(),
    stx: jsonb().$type<StxBase>(),
    seq: integer(),
    error: jsonb().$type<ActivityError>(),
  },
  (table) => [
    // Composite PK required for pg_partman partitioning
    primaryKey({ columns: [table.id, table.createdAt] }),
    index('activities_created_at_index').on(table.createdAt.desc()),
    index('activities_type_index').on(table.type),
    index('activities_user_id_index').on(table.userId),
    index('activities_entity_id_index').on(table.entityId),
    index('activities_table_name_index').on(table.tableName),
    index('activities_tenant_id_index').on(table.tenantId),
    index('activities_stx_id_index').on(sql`(stx->>'id')`),
    index('activities_error_lsn_index').on(sql`(error->>'lsn')`).where(sql`error IS NOT NULL`),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersTable.id],
    }).onDelete('set null'),
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
    }).onDelete('cascade'),
    ...generateActivityContextIndexes(table),
    ...generateActivityContextForeignKeys(table),
  ],
);

export type ActivityModel = typeof activitiesTable.$inferSelect;
export type InsertActivityModel = typeof activitiesTable.$inferInsert;
