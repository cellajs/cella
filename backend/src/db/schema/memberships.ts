import { config } from 'config';
import { boolean, doublePrecision, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { generateContextEntityFields, generateTable } from '#/db/utils';
import { nanoid } from '#/utils/nanoid';
import { tokensTable } from './tokens';

const roleEnum = config.rolesByType.entityRoles;

const { organizationId, ...otherEntityIdColumns } = generateContextEntityFields();

const baseColumns = {
  id: varchar().primaryKey().$defaultFn(nanoid),
  type: varchar({ enum: config.contextEntityTypes }).notNull(),
  userId: varchar()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  role: varchar({ enum: roleEnum }).notNull().default('member'),
  tokenId: varchar().references(() => tokensTable.id, { onDelete: 'cascade' }),
  activatedAt: timestamp(),
  createdAt: timestamp().defaultNow().notNull(),
  createdBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
  modifiedAt: timestamp(),
  modifiedBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
  archived: boolean().default(false).notNull(),
  muted: boolean().default(false).notNull(),
  order: doublePrecision().notNull(),
  organizationId: organizationId.notNull(),
};

// Generate entity id columns based on entity-config
export const membershipsTable = generateTable('memberships', baseColumns, otherEntityIdColumns);

export type MembershipModel = typeof membershipsTable.$inferSelect;
export type InsertMembershipModel = typeof membershipsTable.$inferInsert;
