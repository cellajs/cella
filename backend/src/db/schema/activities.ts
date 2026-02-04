import { appConfig } from 'config';
import { sql } from 'drizzle-orm';
import { foreignKey, index, integer, jsonb, pgTable, primaryKey, varchar } from 'drizzle-orm/pg-core';
import type { ActivityError } from '#/db/utils/activity-error-schema';
import {
  generateActivityContextColumns,
  generateActivityContextForeignKeys,
  generateActivityContextIndexes,
} from '#/db/utils/generate-activity-context-columns';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import type { TxBase } from '#/db/utils/tx-columns';
import { activityActions } from '#/sync/activity-bus';
import { nanoid } from '#/utils/nanoid';
import { usersTable } from './users';

/**
 * Activities table for Change Data Capture (CDC).
 * Tracks create, update, and delete operations across all resources.
 * Can serve as an audit log and future webhook queue.
 *
 * Failed CDC messages (dead letters) are stored with error information
 * in the `error` JSONB field for later inspection and potential replay.
 *
 * PARTITIONING (production only):
 * - Partitioned by createdAt via pg_partman (see partman_setup migration)
 * - Weekly partitions, 90-day retention
 * - Drizzle sees regular table; PostgreSQL has partitioned table
 * - Standard ALTERs (ADD/DROP COLUMN, ADD INDEX) work normally
 *
 * @link http://localhost:4000/docs#tag/activities
 */
export const activitiesTable = pgTable(
  'activities',
  {
    id: varchar().notNull().$defaultFn(nanoid),
    userId: varchar(), // User who performed the action (nullable for system actions)
    entityType: varchar({ enum: appConfig.entityTypes }), // Entity type if applicable
    resourceType: varchar({ enum: appConfig.resourceTypes }), // Resource type if not an entity
    action: varchar({ enum: activityActions }).notNull(), // create, update, delete
    tableName: varchar().notNull(), // Source table name (e.g., 'users', 'organizations')
    type: varchar().notNull(), // Composite type (e.g., 'user.created', 'organization.updated')
    entityId: varchar(), // ID of the entity if applicable
    // Context entity ID columns (organizationId, projectId, etc.) - dynamically generated
    ...generateActivityContextColumns(),
    createdAt: timestampColumns.createdAt,
    changedKeys: jsonb().$type<string[]>(), // Array of keys that changed (for updates)
    // Sync: transaction metadata from product entity tx column (null for context entities)
    tx: jsonb().$type<TxBase>(),
    // Sync: per-ancestor sequence number for list-level gap detection.
    // Scope is determined dynamically by CDC based on entity's context hierarchy
    // (e.g., per-project for tasks, per-org for attachments).
    seq: integer(),
    // Dead letter error info (null for successfully processed activities)
    error: jsonb().$type<ActivityError>(),
  },
  (table) => [
    // Composite PK for pg_partman partitioning by createdAt
    primaryKey({ columns: [table.id, table.createdAt] }),
    index('activities_created_at_index').on(table.createdAt.desc()),
    index('activities_type_index').on(table.type),
    index('activities_user_id_index').on(table.userId),
    index('activities_entity_id_index').on(table.entityId),
    index('activities_table_name_index').on(table.tableName),
    index('activities_tx_id_index').on(sql`(tx->>'id')`),
    // Index for querying dead letters (failed activities with error field)
    index('activities_error_lsn_index').on(sql`(error->>'lsn')`).where(sql`error IS NOT NULL`),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersTable.id],
    }).onDelete('set null'),
    // Dynamic context entity indexes and foreign keys
    ...generateActivityContextIndexes(table),
    ...generateActivityContextForeignKeys(table),
  ],
);

export type ActivityModel = typeof activitiesTable.$inferSelect;
export type InsertActivityModel = typeof activitiesTable.$inferInsert;
