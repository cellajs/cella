import { boolean } from 'drizzle-orm/gel-core';
import { index, pgTable, primaryKey, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

export const supportedOauthProviders = ['github', 'google', 'microsoft'] as const;

export const oauthAccountsTable = pgTable(
  'oauth_accounts',
  {
    id: varchar().$defaultFn(nanoid),
    providerId: varchar({ enum: supportedOauthProviders }).notNull(),
    providerUserId: varchar().notNull(),
    userId: varchar()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    email: varchar().notNull(),
    verified: boolean().notNull().default(false),
    createdAt: timestampColumns.createdAt,
  },
  (table) => [
    primaryKey({
      columns: [table.providerId, table.providerUserId],
    }),
    index('oauth_account_id_idx').on(table.id),
  ],
);

export type OauthAccountsModel = typeof oauthAccountsTable.$inferSelect;
