import { index, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { usersTable } from '#/db/schema/users';
import { maxLength } from '#/db/utils/constraints';
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
    id: varchar({ length: maxLength.id }).notNull().$defaultFn(nanoid),
    secret: varchar({ length: maxLength.field }).notNull(),
    singleUseToken: varchar({ length: maxLength.field }),
    type: varchar({ enum: tokenTypeEnum }).notNull(),
    email: varchar({ length: maxLength.field }).notNull(),
    userId: varchar({ length: maxLength.id }).references(() => usersTable.id, { onDelete: 'cascade' }),
    oauthAccountId: varchar({ length: maxLength.id }).references(() => oauthAccountsTable.id, { onDelete: 'cascade' }),
    inactiveMembershipId: varchar({ length: maxLength.id }),
    createdBy: varchar({ length: maxLength.id }).references(() => usersTable.id, { onDelete: 'cascade' }),
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
