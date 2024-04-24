import { relations } from 'drizzle-orm';
import { pgTable, timestamp, varchar, boolean } from 'drizzle-orm/pg-core';
import { organizationsTable } from './organizations';
import { usersTable } from './users';
import { workspacesTable } from './workspaces';
import { nanoid } from '../../lib/nanoid';

const roleEnum = ['MEMBER', 'ADMIN'] as const;

export const membershipsTable = pgTable('memberships', {
  id: varchar('id').primaryKey().$defaultFn(nanoid),
  organizationId: varchar('organization_id').references(() => organizationsTable.id, { onDelete: 'cascade' }),
  type: varchar('type', {
    enum: ['ORGANIZATION', 'WORKSPACE'],
  })
    .notNull()
    .default('ORGANIZATION'),
  workspaceId: varchar('workspace_id').references(() => workspacesTable.id, { onDelete: 'cascade' }),
  userId: varchar('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  role: varchar('role', { enum: roleEnum }).notNull().default('MEMBER'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: varchar('created_by').references(() => usersTable.id, {
    onDelete: 'set null',
  }),
  modifiedAt: timestamp('modified_at'),
  modifiedBy: varchar('modified_by').references(() => usersTable.id, {
    onDelete: 'set null',
  }),
  inactive: boolean('inactive').default(false),
  muted: boolean('muted').default(false),
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
}));

export type MembershipModel = typeof membershipsTable.$inferSelect;
export type InsertMembershipModel = typeof membershipsTable.$inferInsert;
