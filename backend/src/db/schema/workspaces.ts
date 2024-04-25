import { relations, sql } from 'drizzle-orm';
import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { usersTable } from './users';
import { membershipsTable } from './memberships';
import { organizationsTable } from './organizations';

export const workspacesTable = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: varchar('name').notNull(),
    slug: varchar('slug').unique().notNull(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, {
        onDelete: 'cascade',
      }),
    thumbnailUrl: varchar('thumbnail_url'),
    bannerUrl: varchar('banner_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    modifiedAt: timestamp('modified_at'),
    modifiedBy: uuid('modified_by').references(() => usersTable.id, {
      onDelete: 'set null',
    }),
  },
  (table) => {
    return {
      nameIndex: index('workspace_name_index').on(table.name).desc(),
      createdAtIndex: index('workspace_created_at_index').on(table.createdAt).desc(),
    };
  },
);

export const workspaceTableRelations = relations(workspacesTable, ({ many }) => ({
  users: many(membershipsTable),
}));

export type WorkspaceModel = typeof workspacesTable.$inferSelect;
export type InsertWorkspaceModel = typeof workspacesTable.$inferInsert;
