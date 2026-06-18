import { boolean, index, snakeCase, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/entity-id';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { usersTable } from '#/modules/user/user-db';

export const supportedOAuthProviders = ['github', 'google', 'microsoft'] as const;

/** OAuth accounts for third-party authentication. Users can link multiple providers. */
export const oauthAccountsTable = snakeCase.table(
  'oauth_accounts',
  {
    createdAt: timestampColumns.createdAt,
    id: uuid().primaryKey().$defaultFn(generateId),
    provider: varchar({ enum: supportedOAuthProviders }).notNull(),
    providerUserId: varchar({ length: maxLength.field }).notNull(),
    email: varchar({ length: maxLength.field }).notNull(),
    verified: boolean().notNull().default(false),
    verifiedAt: timestamp({ mode: 'string' }),
    userId: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('oauth_accounts_user_id_idx').on(table.userId),
    unique().on(table.provider, table.providerUserId, table.email),
  ],
);

export type OAuthAccountModel = typeof oauthAccountsTable.$inferSelect;
export type InsertOAuthAccountModel = typeof oauthAccountsTable.$inferInsert;
