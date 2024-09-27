import { pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';

export type SupportedOauthProvider = (typeof supportedOauthProviders)[number];

export const supportedOauthProviders = ['github', 'google', 'microsoft'] as const;

export const oauthAccountsTable = pgTable(
  'oauth_accounts',
  {
    providerId: varchar('provider_id', { enum: supportedOauthProviders }).notNull(),
    providerUserId: varchar('provider_user_id').notNull(),
    userId: varchar('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({
        columns: [table.providerId, table.providerUserId],
      }),
    };
  },
);
