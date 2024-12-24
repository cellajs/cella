import { pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';

export type SupportedOauthProvider = (typeof supportedOauthProviders)[number];

export const supportedOauthProviders = ['github', 'google', 'microsoft'] as const;

export const oauthAccountsTable = pgTable(
  'oauth_accounts',
  {
    providerId: varchar({ enum: supportedOauthProviders }).notNull(),
    providerUserId: varchar().notNull(),
    userId: varchar()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.providerId, table.providerUserId],
    }),
  ],
);
