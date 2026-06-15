import { index, primaryKey, snakeCase, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { generateId } from 'shared/entity-id';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { oauthAccountsTable } from '#/modules/auth/oauth/oauth-accounts-db';
import { usersTable } from '#/modules/user/user-db';

const tokenTypeEnum = appConfig.tokenTypes;

/**
 * Tokens for email verification and invitation.
 *
 * PARTITIONING: Partitioned by expiresAt via pg_partman (weekly, 30-day retention).
 * Drizzle sees a regular table; PostgreSQL manages partitions transparently.
 */
export const tokensTable = snakeCase.table(
  'tokens',
  {
    id: uuid().notNull().$defaultFn(generateId),
    secret: varchar({ length: maxLength.field }).notNull(),
    singleUseToken: varchar({ length: maxLength.field }),
    type: varchar({ enum: tokenTypeEnum }).notNull(),
    email: varchar({ length: maxLength.field }).notNull(),
    userId: uuid().references(() => usersTable.id, { onDelete: 'cascade' }),
    oauthAccountId: uuid().references(() => oauthAccountsTable.id, { onDelete: 'cascade' }),
    inactiveMembershipId: uuid(),
    createdBy: uuid().references(() => usersTable.id, { onDelete: 'cascade' }),
    createdAt: timestampColumns.createdAt,
    expiresAt: timestampColumns.expiresAt,
    invokedAt: timestamp({ withTimezone: true, mode: 'string' }),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.expiresAt] }),
    index('tokens_secret_type_idx').on(table.secret, table.type),
    index('tokens_user_id_idx').on(table.userId),
    index('tokens_created_by_idx').on(table.createdBy),
    index('tokens_single_use_token_idx').on(table.type, table.singleUseToken),
  ],
);

/** Includes sensitive secret field - use only in auth internals */
export type UnsafeTokenModel = typeof tokensTable.$inferSelect;
export type InsertTokenModel = typeof tokensTable.$inferInsert;

/** Safe token type with sensitive field omitted */
export type TokenModel = Omit<UnsafeTokenModel, 'secret'>;
