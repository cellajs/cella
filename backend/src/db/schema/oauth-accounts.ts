import { boolean, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

export const supportedOAuthProviders = ['github', 'google', 'microsoft'] as const;

/**
 * OAuth accounts table to store third-party authentication details.
 * Users can link multiple an OAuth accounts to their profile.
 */
export const oauthAccountsTable = pgTable(
  'oauth_accounts',
  {
    createdAt: timestampColumns.createdAt,
    id: varchar().primaryKey().$defaultFn(nanoid),
    provider: varchar({ enum: supportedOAuthProviders }).notNull(),
    providerUserId: varchar().notNull(),
    email: varchar().notNull(),
    verified: boolean().notNull().default(false),
    verifiedAt: timestamp({ mode: 'string' }),
    userId: varchar()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
  },
  (table) => [unique().on(table.provider, table.providerUserId, table.email)],
);

export type OAuthAccountModel = typeof oauthAccountsTable.$inferSelect;
export type InsertOAuthAccountModel = typeof oauthAccountsTable.$inferInsert;
