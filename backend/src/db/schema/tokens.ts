import { index, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

const tokenTypeEnum = appConfig.tokenTypes;

/**
 * Tokens table contains tokens of different types: email verification, invitation, password reset.
 * Users can have multiple tokens of different types. Users can also have multiple tokens of the same type (e.g., multiple password reset requests).
 * Tokens can be associated with an email, user, oauth account, or inactive membership. Invoking a token marks it as used by setting invokedAt and creates a singleUseToken.
 *
 * PARTITIONING (production only):
 * - Partitioned by expiresAt via pg_partman (see 0002_partman_setup.sql)
 * - Weekly partitions, 30-day retention after expiry
 * - Drizzle sees regular table; PostgreSQL has partitioned table
 * - Standard ALTERs (ADD/DROP COLUMN, ADD INDEX) work normally
 *
 * @link http://localhost:4000/docs#tag/tokens
 */
export const tokensTable = pgTable(
  'tokens',
  {
    id: varchar().notNull().$defaultFn(nanoid),
    token: varchar().notNull(),
    singleUseToken: varchar(),
    type: varchar({ enum: tokenTypeEnum }).notNull(),
    email: varchar().notNull(),
    userId: varchar().references(() => usersTable.id, { onDelete: 'cascade' }),
    oauthAccountId: varchar().references(() => oauthAccountsTable.id, { onDelete: 'cascade' }),
    inactiveMembershipId: varchar(),
    createdBy: varchar().references(() => usersTable.id, { onDelete: 'cascade' }),
    createdAt: timestampColumns.createdAt,
    expiresAt: timestampColumns.expiresAt,
    invokedAt: timestamp({ withTimezone: true, mode: 'string' }),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.expiresAt] }),
    index('tokens_token_type_idx').on(table.token, table.type),
    index('tokens_user_id_idx').on(table.userId),
  ],
);

/** Includes sensitive token field - use only in auth internals */
export type UnsafeTokenModel = typeof tokensTable.$inferSelect;
export type InsertTokenModel = typeof tokensTable.$inferInsert;

/** Safe token type with sensitive field omitted */
export type TokenModel = Omit<UnsafeTokenModel, 'token'>;
