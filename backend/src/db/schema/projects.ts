import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '../../lib/nanoid';
import { usersTable } from './users';
import { workspacesTable } from './workspaces';

// Add a 'type' column or virtual property with a static value of "project" to directly identify the resource type from the data
// TODO: Store organizationId (full parent tree) to directly retrieve all user projects within an organization and to check user permissions based on ancestor roles
export const projectsTable = pgTable('projects', {
  id: varchar('id').primaryKey().$defaultFn(nanoid),
  slug: varchar('slug').notNull(),
  name: varchar('name').notNull(),
  color: varchar('color').notNull(),
  workspaceId: varchar('workspace_id')
    .notNull()
    .references(() => workspacesTable.id, {
      onDelete: 'cascade',
    }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: varchar('created_by').references(() => usersTable.id, {
    onDelete: 'set null',
  }),
  modifiedAt: timestamp('modified_at'),
  modifiedBy: varchar('modified_by').references(() => usersTable.id, {
    onDelete: 'set null',
  }),
});

export type ProjectModel = typeof projectsTable.$inferSelect;
export type InsertProjectModel = typeof projectsTable.$inferInsert;
