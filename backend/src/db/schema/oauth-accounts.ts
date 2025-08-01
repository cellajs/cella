import { boolean, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

export const supportedOAuthProviders = ['github', 'google', 'microsoft'] as const;

export const oauthAccountsTable = pgTable(
  'oauth_accounts',
  {
    createdAt: timestampColumns.createdAt,
    id: varchar().primaryKey().$defaultFn(nanoid),
    providerId: varchar({ enum: supportedOAuthProviders }).notNull(),
    providerUserId: varchar().notNull(),
    email: varchar().notNull(),
    verified: boolean().notNull().default(false),
    verifiedAt: timestamp({ mode: 'string' }),
    tenantId: varchar(),
    userId: varchar()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    // Composite unique constraint on (providerId, providerUserId, email)
    uniqueProviderUserCombo: unique().on(table.providerId, table.providerUserId, table.email),
  }),
);

export type OAuthAccountModel = typeof oauthAccountsTable.$inferInsert;
