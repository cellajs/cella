import { appConfig } from 'config';
import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

const tokenTypeEnum = appConfig.tokenTypes;

/**
 * Tokens table contains tokens of different types: email verification, invitation, password reset.
 * Users can have multiple tokens of different types. Users can also have multiple tokens of the same type (e.g., multiple password reset requests).
 * Tokens can be associated with an email, user, oauth account, or inactive membership. Invoking a token marks it as used by setting invokedAt and creates a singleUseToken.
 * Tokens can expire based on expiresAt. TODO: implement cleanup of expired tokens 30 days after expiration.
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
  inactiveMembershipId: varchar(),
  createdBy: varchar().references(() => usersTable.id, { onDelete: 'cascade' }),
  expiresAt: timestampColumns.expiresAt,
  invokedAt: timestamp({ withTimezone: true, mode: 'date' }),
});

export type TokenModel = typeof tokensTable.$inferSelect;
export type InsertTokenModel = typeof tokensTable.$inferInsert;
