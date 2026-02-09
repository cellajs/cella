import { index, pgTable, primaryKey, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

/**
 * Unsubscribe tokens table to manage email unsubscribe tokens for users.
 * Multiple tokens per user allowed - old tokens remain valid for 90 days.
 *
 * PARTITIONING (production only):
 * - Partitioned by createdAt via pg_partman (see 0002_partman_setup.sql)
 * - Monthly partitions, 90-day retention
 * - Drizzle sees regular table; PostgreSQL has partitioned table
 * - Standard ALTERs (ADD/DROP COLUMN, ADD INDEX) work normally
 */
export const unsubscribeTokensTable = pgTable(
  'unsubscribe_tokens',
  {
    id: varchar().notNull().$defaultFn(nanoid),
    userId: varchar()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    secret: varchar().notNull(),
    createdAt: timestampColumns.createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.id, table.createdAt] }),
    index('unsubscribe_tokens_secret_idx').on(table.secret),
    index('unsubscribe_tokens_user_id_idx').on(table.userId),
  ],
);

export type UnsubscribeTokenModel = typeof unsubscribeTokensTable.$inferSelect;
export type InsertUnsubscribeTokenModel = typeof unsubscribeTokensTable.$inferInsert;
