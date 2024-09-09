import { config } from 'config';
import { relations } from 'drizzle-orm';
import { boolean, doublePrecision, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { nanoid } from '#/lib/nanoid';
import { organizationsTable } from './organizations';

const roleEnum = config.rolesByType.entityRoles;

export const membershipsTable = pgTable('memberships', {
  id: varchar('id').primaryKey().$defaultFn(nanoid),
  type: varchar('type', { enum: config.contextEntityTypes }).notNull(),
  organizationId: varchar('organization_id')
    .notNull()
    .references(() => organizationsTable.id, { onDelete: 'cascade' }),
  userId: varchar('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  role: varchar('role', { enum: roleEnum }).notNull().default('member'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: varchar('created_by').references(() => usersTable.id, {
    onDelete: 'set null',
  }),
  modifiedAt: timestamp('modified_at'),
  modifiedBy: varchar('modified_by').references(() => usersTable.id, {
    onDelete: 'set null',
  }),
  archived: boolean('archived').default(false).notNull(),
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
}));

export const membershipSelect = {
  id: membershipsTable.id,
  role: membershipsTable.role,
  archived: membershipsTable.archived,
  muted: membershipsTable.muted,
  order: membershipsTable.order,
  userId: membershipsTable.userId,
  organizationId: membershipsTable.organizationId,
};

export type MembershipModel = typeof membershipsTable.$inferSelect;
export type InsertMembershipModel = typeof membershipsTable.$inferInsert;
