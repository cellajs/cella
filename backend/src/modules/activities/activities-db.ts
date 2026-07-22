import { index, jsonb, primaryKey, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { activityActions, activityEventTypes, appConfig } from 'shared';
import { activityChannelColumns } from '#/db/utils/channel-relation-columns';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import type { StxBase } from '#/schemas/sync-transaction-schemas';

/**
 * Append-only CDC activity log partitioned weekly with 90-day retention.
 * LSN-derived IDs make WAL replay idempotent. The partitioned table intentionally has no
 * foreign keys; Drizzle accesses it as a regular table.
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
    ...activityChannelColumns(),
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
