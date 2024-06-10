import { config } from 'config';
import { pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from './users';

export const oauthAccountsTable = pgTable(
  'oauth_accounts',
  {
    providerId: varchar('provider_id', { enum: config.oauthProviderOptions }).notNull(),
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
