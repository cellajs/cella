import { appConfig } from 'config';
import { timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { generateContextEntityIdColumns } from '#/db/utils/generate-context-entity-columns';
import { generateTable } from '#/db/utils/generate-table';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';
import { tokensTable } from './tokens';

const roleEnum = appConfig.roles.entityRoles;

const { organizationId, ...otherEntityIdColumns } = generateContextEntityIdColumns();

const baseColumns = {
  createdAt: timestampColumns.createdAt,
  id: varchar().primaryKey().$defaultFn(nanoid),
  contextType: varchar({ enum: appConfig.contextEntityTypes }).notNull(),
  email: varchar().notNull(),
  userId: varchar().references(() => usersTable.id, { onDelete: 'cascade' }),
  tokenId: varchar().references(() => tokensTable.id, { onDelete: 'set null' }),
  role: varchar({ enum: roleEnum }).notNull().default('member'),
  rejectedAt: timestamp({ mode: 'string' }),
  createdBy: varchar()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  organizationId: organizationId.notNull(),
  uniqueKey: varchar().unique().notNull(),
};

/**
 * Inactive memberships table to track memberships that have are pending (invitations) or rejected.
 * They are a subset of the membershipsTable columns, and include email and rejectedAt fields to track
 * the status of the inactive membership.
 */
export const inactiveMembershipsTable = generateTable('inactive_memberships', baseColumns, otherEntityIdColumns);

export type InactiveMembershipModel = typeof inactiveMembershipsTable.$inferSelect;
export type InsertInactiveMembershipModel = typeof inactiveMembershipsTable.$inferInsert;
