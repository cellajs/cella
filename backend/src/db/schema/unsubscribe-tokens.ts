import { index, pgTable, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

/**
 * Unsubscribe tokens table to manage email unsubscribe tokens for users.
 */
export const unsubscribeTokensTable = pgTable(
  'unsubscribe_tokens',
  {
    id: varchar().primaryKey().$defaultFn(nanoid),
    userId: varchar()
      .notNull()
      .unique()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    token: varchar().unique().notNull(),
    createdAt: timestampColumns.createdAt,
  },
  (table) => [index('users_token_index').on(table.token)],
);

export type UnsubscribeTokenModel = typeof unsubscribeTokensTable.$inferSelect;
export type InsertUnsubscribeTokenModel = typeof unsubscribeTokensTable.$inferInsert;
