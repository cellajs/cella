import { index, pgTable, timestamp, varchar, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { projectsTable } from './projects';
import { workspacesTable } from './workspaces';

export const projectsToWorkspacesTable = pgTable(
  'projects_to_workspaces',
  {
    projectId: varchar('project_id')
    .notNull()
    .references(() => projectsTable.id, {
      onDelete: 'cascade',
    }),
    workspaceId: varchar('workspace_id')
    .notNull()
    .references(() => workspacesTable.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ 
        columns: [table.projectId, table.workspaceId] 
      }),
      workspaceIndex: index('workspace_id_index').on(table.workspaceId.desc()),
    };
  },
);

export const projectsToWorkspacesRelations = relations(projectsToWorkspacesTable, ({ one }) => ({
  project: one(projectsTable, {
    fields: [projectsToWorkspacesTable.projectId],
    references: [projectsTable.id],
  }),
  workspace: one(workspacesTable, {
    fields: [projectsToWorkspacesTable.workspaceId],
    references: [workspacesTable.id],
  }),
}));

export type ProjectToWorkspaceModel = typeof projectsToWorkspacesTable.$inferSelect;
export type InsertProjectToWorkspaceModel = typeof projectsToWorkspacesTable.$inferInsert;
