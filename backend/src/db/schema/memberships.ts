import { appConfig } from 'config';
import { boolean, doublePrecision, varchar } from 'drizzle-orm/pg-core';
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
  userId: varchar()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  role: varchar({ enum: roleEnum }).notNull().default('member'),
  createdBy: varchar()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'set null' }),
  modifiedAt: timestampColumns.modifiedAt,
  modifiedBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
  archived: boolean().default(false).notNull(),
  muted: boolean().default(false).notNull(),
  order: doublePrecision().notNull(),
  organizationId: organizationId.notNull(),
  uniqueKey: varchar().unique().notNull(),
};

// Generate entity id columns based on entity-config
export const membershipsTable = generateTable('memberships', baseColumns, otherEntityIdColumns);

export type MembershipModel = typeof membershipsTable.$inferSelect;
export type InsertMembershipModel = typeof membershipsTable.$inferInsert;
