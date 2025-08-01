import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { generateContextEntityTypeFields } from '#/db/utils/generate-context-entity-fields';
import { generateTable } from '#/db/utils/generate-table';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';
import { appConfig } from 'config';
import { boolean, doublePrecision, timestamp, varchar } from 'drizzle-orm/pg-core';

const roleEnum = appConfig.rolesByType.entityRoles;

const { organizationId, ...otherEntityIdColumns } = generateContextEntityTypeFields();

const baseColumns = {
  createdAt: timestampColumns.createdAt,
  id: varchar().primaryKey().$defaultFn(nanoid),
  contextType: varchar({ enum: appConfig.contextEntityTypes }).notNull(),
  userId: varchar()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  role: varchar({ enum: roleEnum }).notNull().default('member'),
  tokenId: varchar().references(() => tokensTable.id, { onDelete: 'cascade' }),
  activatedAt: timestamp({ mode: 'string' }),
  createdBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
  modifiedAt: timestampColumns.modifiedAt,
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
