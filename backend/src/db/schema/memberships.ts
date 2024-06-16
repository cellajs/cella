import { config } from 'config';
import { relations } from 'drizzle-orm';
import { boolean, doublePrecision, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '../../lib/nanoid';
import { organizationsTable } from './organizations';
import { projectsTable } from './projects';
import { usersTable } from './users';
import { workspacesTable } from './workspaces';

const roleEnum = config.rolesByType.entityRoles;

export const membershipsTable = pgTable('memberships', {
  id: varchar('id').primaryKey().$defaultFn(nanoid),
  type: varchar('type', {
    enum: config.contextEntityTypes,
  }).notNull(),
  organizationId: varchar('organization_id').references(() => organizationsTable.id, { onDelete: 'cascade' }),
  workspaceId: varchar('workspace_id').references(() => workspacesTable.id, { onDelete: 'cascade' }),
  projectId: varchar('project_id').references(() => projectsTable.id, { onDelete: 'cascade' }),
  userId: varchar('user_id').references(() => usersTable.id, { onDelete: 'cascade' }),
  role: varchar('role', { enum: roleEnum }).notNull().default('MEMBER'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: varchar('created_by').references(() => usersTable.id, {
    onDelete: 'set null',
  }),
  modifiedAt: timestamp('modified_at'),
  modifiedBy: varchar('modified_by').references(() => usersTable.id, {
    onDelete: 'set null',
  }),
  inactive: boolean('inactive').default(false).notNull(),
  muted: boolean('muted').default(false).notNull(),
  order: doublePrecision('sort_order').notNull(),
});

export const membershipsTableRelations = relations(membershipsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [membershipsTable.userId],
    references: [usersTable.id],
  }),
  organization: one(organizationsTable, {
    fields: [membershipsTable.organizationId],
    references: [organizationsTable.id],
  }),
  workspace: one(workspacesTable, {
    fields: [membershipsTable.workspaceId],
    references: [workspacesTable.id],
  }),
  project: one(projectsTable, {
    fields: [membershipsTable.projectId],
    references: [projectsTable.id],
  }),
}));

export type MembershipModel = typeof membershipsTable.$inferSelect;
export type InsertMembershipModel = typeof membershipsTable.$inferInsert;
