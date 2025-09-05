import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { usersTable } from '#/db/schema/users';
import { generateContextEntityTypeFields } from '#/db/utils/generate-context-entity-fields';
import { generateTable } from '#/db/utils/generate-table';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';
import { appConfig } from 'config';
import { timestamp, varchar } from 'drizzle-orm/pg-core';

const tokenTypeEnum = appConfig.tokenTypes;
const roleEnum = appConfig.rolesByType.entityRoles;

// Base columns for tokens table
const baseColumns = {
  createdAt: timestampColumns.createdAt,
  id: varchar().primaryKey().$defaultFn(nanoid),
  token: varchar().notNull(),
  type: varchar({ enum: tokenTypeEnum }).notNull(),
  email: varchar().notNull(),
  entityType: varchar({ enum: appConfig.contextEntityTypes }),
  role: varchar({ enum: roleEnum }),
  userId: varchar().references(() => usersTable.id, { onDelete: 'cascade' }),
  oauthAccountId: varchar().references(() => oauthAccountsTable.id, { onDelete: 'set null' }),
  createdBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
  expiresAt: timestampColumns.expiresAt,
  consumedAt: timestamp({ withTimezone: true, mode: 'date' }),
};

// Generate entity id columns based on entity-config
const additionalColumns = generateContextEntityTypeFields();

/**
 * Tokens table contains tokens of different types: email verification, invitation, password reset.
 * A token is always related to a userId. It can also be related to an entityId (e.g. organizationId, projectId, etc.).
 *
 * @link http://localhost:4000/docs#tag/tokens
 */
export const tokensTable = generateTable('tokens', baseColumns, additionalColumns);

export type TokenModel = typeof tokensTable.$inferSelect;
export type InsertTokenModel = typeof tokensTable.$inferInsert;
