import { index, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

const tokenTypeEnum = appConfig.tokenTypes;

/**
 * Tokens for email verification, invitation, and password reset.
 *
 * PARTITIONING: Partitioned by expiresAt via pg_partman (weekly, 30-day retention).
 * Drizzle sees a regular table; PostgreSQL manages partitions transparently.
 */
export const tokensTable = pgTable(
  'tokens',
  {
    id: varchar().notNull().$defaultFn(nanoid),
    secret: varchar().notNull(),
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
    index('tokens_secret_type_idx').on(table.secret, table.type),
    index('tokens_user_id_idx').on(table.userId),
  ],
);

/** Includes sensitive secret field - use only in auth internals */
export type UnsafeTokenModel = typeof tokensTable.$inferSelect;
export type InsertTokenModel = typeof tokensTable.$inferInsert;

/** Safe token type with sensitive field omitted */
export type TokenModel = Omit<UnsafeTokenModel, 'secret'>;
