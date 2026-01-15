import { appConfig } from 'config';
import { foreignKey, index, jsonb, pgTable, varchar } from 'drizzle-orm/pg-core';
import { activityActions, resourceTypes } from '#/activities-config';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';
import { organizationsTable } from './organizations';
import { usersTable } from './users';

/**
 * Activities table for Change Data Capture (CDC).
 * Tracks create, update, and delete operations across all resources.
 * Can serve as an audit log and future webhook queue.
 *
 * @link http://localhost:4000/docs#tag/activities
 */
export const activitiesTable = pgTable(
  'activities',
  {
    id: varchar().primaryKey().$defaultFn(nanoid),
    userId: varchar(), // User who performed the action (nullable for system actions)
    entityType: varchar({ enum: appConfig.entityTypes }), // Entity type if applicable
    resourceType: varchar({ enum: resourceTypes }), // Resource type if not an entity
    action: varchar({ enum: activityActions }), // create, update, delete
    tableName: varchar().notNull(), // Source table name (e.g., 'users', 'organizations')
    type: varchar().notNull(), // Composite type (e.g., 'user.created', 'organization.updated')
    entityId: varchar(), // ID of the entity if applicable
    organizationId: varchar(), // Organization context (derived from entity's organizationId or self for organizations)
    createdAt: timestampColumns.createdAt,
    changedKeys: jsonb().$type<string[]>(), // Array of keys that changed (for updates)
  },
  (table) => [
    index('activities_created_at_index').on(table.createdAt.desc()),
    index('activities_type_index').on(table.type),
    index('activities_user_id_index').on(table.userId),
    index('activities_entity_id_index').on(table.entityId),
    index('activities_table_name_index').on(table.tableName),
    index('activities_organization_id_index').on(table.organizationId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersTable.id],
    }).onDelete('set null'),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizationsTable.id],
    }).onDelete('cascade'),
  ],
);

export type ActivityModel = typeof activitiesTable.$inferSelect;
export type InsertActivityModel = typeof activitiesTable.$inferInsert;
