import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '../../lib/nanoid';
import { organizationsTable } from './organizations';
import { usersTable } from './users';
import { workspacesTable } from './workspaces';

export const projectsTable = pgTable('projects', {
  id: varchar('id').primaryKey().$defaultFn(nanoid),
  entity: varchar('entity').notNull().default('PROJECT'),
  slug: varchar('slug').notNull(),
  name: varchar('name').notNull(),
  color: varchar('color').notNull(),
  organizationId: varchar('organization_id')
    .notNull()
    .references(() => organizationsTable.id, {
      onDelete: 'cascade',
    }),
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
