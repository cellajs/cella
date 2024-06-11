import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '../../lib/nanoid';
import { membershipsTable } from './memberships';
import { organizationsTable } from './organizations';
import { projectsToWorkspacesTable } from './projects-to-workspaces';
import { usersTable } from './users';

export const workspacesTable = pgTable(
  'workspaces',
  {
    id: varchar('id').primaryKey().$defaultFn(nanoid),
    entity: varchar('entity').notNull().default('WORKSPACE'),
    name: varchar('name').notNull(),
    slug: varchar('slug').unique().notNull(),
    organizationId: varchar('organization_id')
      .notNull()
      .references(() => organizationsTable.id, {
        onDelete: 'cascade',
      }),
    thumbnailUrl: varchar('thumbnail_url'),
    bannerUrl: varchar('banner_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdBy: varchar('created_by').references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    modifiedAt: timestamp('modified_at'),
    modifiedBy: varchar('modified_by').references(() => usersTable.id, {
      onDelete: 'set null',
    }),
  },
  (table) => {
    return {
      nameIndex: index('workspace_name_index').on(table.name.desc()),
      createdAtIndex: index('workspace_created_at_index').on(table.createdAt.desc()),
    };
  },
);

export const workspaceTableRelations = relations(workspacesTable, ({ many }) => ({
  users: many(membershipsTable),
  projects: many(projectsToWorkspacesTable),
}));

export type WorkspaceModel = typeof workspacesTable.$inferSelect;
export type InsertWorkspaceModel = typeof workspacesTable.$inferInsert;
