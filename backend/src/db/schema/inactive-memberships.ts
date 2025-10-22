import { appConfig } from 'config';
import { timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { generateContextEntityTypeFields } from '#/db/utils/generate-context-entity-fields';
import { generateTable } from '#/db/utils/generate-table';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';
import { tokensTable } from './tokens';
import { organizationsTable } from './organizations';

const roleEnum = appConfig.roles.entityRoles;

const { organizationId, ...otherEntityIdColumns } = generateContextEntityTypeFields();

const baseColumns = {
  createdAt: timestampColumns.createdAt,
  id: varchar().primaryKey().$defaultFn(nanoid),
  contextType: varchar({ enum: appConfig.contextEntityTypes }).notNull(),
  tokenId: varchar().references(() => tokensTable.id, { onDelete: 'cascade' }),
  userId: varchar()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  role: varchar({ enum: roleEnum }).notNull().default('member'),
  rejectedAt: timestamp({ mode: 'string' }),
  createdBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
  organizationId: varchar().notNull().references(() => organizationsTable.id, { onDelete: 'cascade' }),
};

// Generate entity id columns based on entity-config
export const inactiveMembershipsTable = generateTable('inactive_memberships', baseColumns, otherEntityIdColumns);

export type MembershipModel = typeof inactiveMembershipsTable.$inferSelect;
export type InsertMembershipModel = typeof inactiveMembershipsTable.$inferInsert;
