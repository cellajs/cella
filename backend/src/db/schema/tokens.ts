import { config } from 'config';
import { varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { generateContextEntityFields } from '#/db/utils/generate-context-entity-fields';
import { generateTable } from '#/db/utils/generate-table';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

const tokenTypeEnum = config.tokenTypes;
const roleEnum = config.rolesByType.entityRoles;

// Base columns for tokens table
const baseColumns = {
  id: varchar().primaryKey().$defaultFn(nanoid),
  token: varchar().notNull(),
  type: varchar({ enum: tokenTypeEnum }).notNull(),
  email: varchar().notNull(),
  entity: varchar({ enum: config.contextEntities }),
  role: varchar({ enum: roleEnum }),
  userId: varchar().references(() => usersTable.id, { onDelete: 'cascade' }),
  createdAt: timestampColumns.createdAt,
  createdBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
  expiresAt: timestampColumns.expiresAt,
};

// Generate entity id columns based on entity-config
const additionalColumns = generateContextEntityFields();

/**
 * Tokens table contains tokens of different types: email verification, invitation, password reset.
 * A token is always related to a userId. It can also be related to an entityId (e.g. organizationId, projectId, etc.).
 *
 * @link http://localhost:4000/docs#tag/tokens
 */
export const tokensTable = generateTable('tokens', baseColumns, additionalColumns);

export type TokenModel = typeof tokensTable.$inferSelect;
export type InsertTokenModel = typeof tokensTable.$inferInsert;
