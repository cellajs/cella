import { relations } from 'drizzle-orm';
import { pgTable, primaryKey, timestamp, varchar, boolean } from 'drizzle-orm/pg-core';
import { organizationsTable } from './organizations';
import { usersTable } from './users';

const roleEnum = ['MEMBER', 'ADMIN'] as const;

export const membershipsTable = pgTable(
  'memberships',
  {
    organizationId: varchar('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
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
        columns: [table.organizationId, table.userId],
      }),
    };
  },
);

export const membershipsTableRelations = relations(membershipsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [membershipsTable.userId],
    references: [usersTable.id],
  }),
  organization: one(organizationsTable, {
    fields: [membershipsTable.organizationId],
    references: [organizationsTable.id],
  }),
}));

export type MembershipModel = typeof membershipsTable.$inferSelect;
export type InsertMembershipModel = typeof membershipsTable.$inferInsert;
