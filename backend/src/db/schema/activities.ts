import { index, jsonb, primaryKey, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { activityActions, activityEventTypes, appConfig } from 'shared';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import type { StxBase } from '#/schemas/sync-transaction-schemas';

/**
 * Activities table for Change Data Capture (CDC).
 * Tracks create, update, and delete operations across all resources.
 *
 * PARTITIONING: Partitioned by createdAt via pg_partman (weekly, 90-day retention).
 * Drizzle sees a regular table; PostgreSQL manages partitions transparently.
 *
 * Id is a a LSN-based string (e.g. "0-16B3748") for deterministic idempotent WAL listening.
 *
 * No FKs — partitioned tables don't support foreign key constraints,
 * and activities are append-only CDC logs that don't need referential integrity.
 */
export const activitiesTable = snakeCase.table(
  'activities',
  {
    id: varchar({ length: maxLength.id }).notNull(),
    tenantId: varchar('tenant_id', { length: tenantIdLength }),
    userId: uuid(),
    entityType: varchar({ enum: appConfig.entityTypes }),
    resourceType: varchar({ enum: appConfig.resourceTypes }),
    action: varchar({ enum: activityActions }).notNull(),
    tableName: varchar({ length: maxLength.field }).notNull(),
    type: varchar({ enum: activityEventTypes }).notNull(),
    subjectId: varchar('subject_id', { length: maxLength.id }),
    organizationId: uuid(),
    createdAt: timestampColumns.createdAt,
    changedFields: jsonb().$type<string[]>(),
    stx: jsonb().$type<StxBase>(),
  },
  (table) => [
    // Composite PK required for pg_partman partitioning
    primaryKey({ columns: [table.id, table.createdAt] }),
    index('activities_created_at_index').on(table.createdAt.desc()),
    // Composite indexes matching actual query patterns (cursor-based scans)
    index('activities_org_id_index').on(table.organizationId, table.id),
    index('activities_entity_type_subject_id_index').on(table.entityType, table.id),
  ],
);

export type ActivityModel = typeof activitiesTable.$inferSelect;
export type InsertActivityModel = typeof activitiesTable.$inferInsert;
