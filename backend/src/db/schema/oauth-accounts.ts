import { pgTable, primaryKey, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampsColumn } from '#/db/utils/timestamp-columns';

export const supportedOauthProviders = ['github', 'google', 'microsoft'] as const;

export const oauthAccountsTable = pgTable(
  'oauth_accounts',
  {
    providerId: varchar({ enum: supportedOauthProviders }).notNull(),
    providerUserId: varchar().notNull(),
    userId: varchar()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    createdAt: timestampsColumn.createdAt,
  },
  (table) => [
    primaryKey({
      columns: [table.providerId, table.providerUserId],
    }),
  ],
);
