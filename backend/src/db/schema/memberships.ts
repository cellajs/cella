import { config } from 'config';
import { boolean, doublePrecision, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { nanoid } from '#/utils/nanoid';
import { organizationsTable } from './organizations';
import { projectsTable } from './projects';
import { workspacesTable } from './workspaces';

const roleEnum = config.rolesByType.entityRoles;

export const membershipsTable = pgTable('memberships', {
  id: varchar('id').primaryKey().$defaultFn(nanoid),
  type: varchar('type', { enum: config.contextEntityTypes }).notNull(),
  userId: varchar('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  role: varchar('role', { enum: roleEnum }).notNull().default('member'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: varchar('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
  modifiedAt: timestamp('modified_at'),
  modifiedBy: varchar('modified_by').references(() => usersTable.id, { onDelete: 'set null' }),
  archived: boolean('archived').default(false).notNull(),
  muted: boolean('muted').default(false).notNull(),
  order: doublePrecision('sort_order').notNull(),
  organizationId: varchar('organization_id')
    .notNull()
    .references(() => organizationsTable.id, { onDelete: 'cascade' }),
  workspaceId: varchar('workspace_id').references(() => workspacesTable.id, { onDelete: 'cascade' }),
  projectId: varchar('project_id').references(() => projectsTable.id, { onDelete: 'cascade' }),
});

export const membershipSelect = {
  id: membershipsTable.id,
  role: membershipsTable.role,
  archived: membershipsTable.archived,
  muted: membershipsTable.muted,
  order: membershipsTable.order,
  type: membershipsTable.type,
  userId: membershipsTable.userId,
  organizationId: membershipsTable.organizationId,
  workspaceId: membershipsTable.workspaceId,
  projectId: membershipsTable.projectId,
};

export type MembershipModel = typeof membershipsTable.$inferSelect;
export type InsertMembershipModel = typeof membershipsTable.$inferInsert;
