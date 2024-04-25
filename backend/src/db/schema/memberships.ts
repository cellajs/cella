import { relations, sql } from 'drizzle-orm';
import { pgTable, timestamp, varchar, boolean, uuid } from 'drizzle-orm/pg-core';
import { organizationsTable } from './organizations';
import { usersTable } from './users';
import { workspacesTable } from './workspaces';


const roleEnum = ['MEMBER', 'ADMIN'] as const;

export const membershipsTable = pgTable('memberships', {
    // defaultRandom() can do same thing, but this way makes it easier to use UUIDv7 in the future.
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid('organization_id').references(() => organizationsTable.id, { onDelete: 'cascade' }),
  type: varchar('type', {
    enum: ['ORGANIZATION', 'WORKSPACE'],
  })
    .notNull()
    .default('ORGANIZATION'),
  workspaceId: uuid('workspace_id').references(() => workspacesTable.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  role: varchar('role', { enum: roleEnum }).notNull().default('MEMBER'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: uuid('created_by').references(() => usersTable.id, {
    onDelete: 'set null',
  }),
  modifiedAt: timestamp('modified_at'),
  modifiedBy: uuid('modified_by').references(() => usersTable.id, {
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
