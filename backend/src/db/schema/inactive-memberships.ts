import { appConfig } from 'config';
import { timestamp, varchar } from 'drizzle-orm/pg-core';
import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';
import { generateContextEntityTypeFields } from '#/db/utils/generate-context-entity-fields';
import { generateTable } from '#/db/utils/generate-table';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

const roleEnum = appConfig.roles.entityRoles;

const { organizationId, ...otherEntityIdColumns } = generateContextEntityTypeFields();

const baseColumns = {
  createdAt: timestampColumns.createdAt,
  id: varchar().primaryKey().$defaultFn(nanoid),
  contextType: varchar({ enum: appConfig.contextEntityTypes }).notNull(),
  userId: varchar().references(() => usersTable.id, { onDelete: 'cascade' }),
  role: varchar({ enum: roleEnum }).notNull().default('member'),
  rejectedAt: timestamp({ mode: 'string' }),
  createdBy: varchar()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  organizationId: varchar()
    .notNull()
    .references(() => organizationsTable.id, { onDelete: 'cascade' }),
};

// Generate entity id columns based on entity-config
export const inactiveMembershipsTable = generateTable('inactive_memberships', baseColumns, otherEntityIdColumns);

export type InactiveMembershipModel = typeof inactiveMembershipsTable.$inferSelect;
export type InsertInactiveMembershipModel = typeof inactiveMembershipsTable.$inferInsert;
