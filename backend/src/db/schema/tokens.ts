import { appConfig } from 'config';
import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

const tokenTypeEnum = appConfig.tokenTypes;

/**
 * Tokens table contains tokens of different types: email verification, invitation, password reset.
 * A token is always related to a userId. It can also be related to an entityId (e.g. organizationId, projectId, etc.).
 *
 * @link http://localhost:4000/docs#tag/tokens
 */
export const tokensTable = pgTable('tokens', {
  createdAt: timestampColumns.createdAt,
  id: varchar().primaryKey().$defaultFn(nanoid),
  token: varchar().notNull(),
  singleUseToken: varchar(),
  type: varchar({ enum: tokenTypeEnum }).notNull(),
  email: varchar().notNull(),
  userId: varchar().references(() => usersTable.id, { onDelete: 'cascade' }),
  oauthAccountId: varchar().references(() => oauthAccountsTable.id, { onDelete: 'cascade' }),
  inactiveMembershipId: varchar().references(() => inactiveMembershipsTable.id, { onDelete: 'cascade' }),
  createdBy: varchar().references(() => usersTable.id, { onDelete: 'cascade' }),
  expiresAt: timestampColumns.expiresAt,
  invokedAt: timestamp({ withTimezone: true, mode: 'date' }),
});

export type TokenModel = typeof tokensTable.$inferSelect;
