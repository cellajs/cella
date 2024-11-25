import { config } from 'config';
import { boolean, doublePrecision, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { nanoid } from '#/utils/nanoid';
import { organizationsTable } from './organizations';

const roleEnum = config.rolesByType.entityRoles;

export const membershipsTable = pgTable('memberships', {
  id: varchar().primaryKey().$defaultFn(nanoid),
  type: varchar({ enum: config.contextEntityTypes }).notNull(),
  userId: varchar()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  role: varchar({ enum: roleEnum }).notNull().default('member'),
  createdAt: timestamp().defaultNow().notNull(),
  createdBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
  modifiedAt: timestamp(),
  modifiedBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
  archived: boolean().default(false).notNull(),
  muted: boolean().default(false).notNull(),
  order: doublePrecision().notNull(),
  organizationId: varchar()
    .notNull()
    .references(() => organizationsTable.id, { onDelete: 'cascade' }),
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
};

export type MembershipModel = typeof membershipsTable.$inferSelect;
export type InsertMembershipModel = typeof membershipsTable.$inferInsert;
