import { relations } from 'drizzle-orm';
import { pgTable, primaryKey, timestamp, varchar, boolean } from 'drizzle-orm/pg-core';
import { workspacesTable } from './workspaces';
import { usersTable } from './users';

const roleEnum = ['MEMBER', 'ADMIN'] as const;

export const workspaceMembershipsTable = pgTable(
  'workspaceMembership',
  {
    workspaceId: varchar('workspace_id')
      .notNull()
      .references(() => workspacesTable.id, { onDelete: 'cascade' }),
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
  },
  (table) => {
    return {
      pk: primaryKey({
        columns: [table.workspaceId, table.userId],
      }),
    };
  },
);

export const membershipsTableRelations = relations(workspaceMembershipsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [workspaceMembershipsTable.userId],
    references: [usersTable.id],
  }),
  organization: one(workspacesTable, {
    fields: [workspaceMembershipsTable.workspaceId],
    references: [workspacesTable.id],
  }),
}));

export type WorkspaceMembershipModel = typeof workspaceMembershipsTable.$inferSelect;
export type InsertWorkspaceMembershipModel = typeof workspaceMembershipsTable.$inferInsert;
