import { index, pgTable, primaryKey, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

/**
 * Email unsubscribe tokens. Multiple per user allowed, old tokens remain valid.
 *
 * PARTITIONING: Partitioned by createdAt via pg_partman (monthly, 90-day retention).
 * Drizzle sees a regular table; PostgreSQL manages partitions transparently.
 */
export const unsubscribeTokensTable = pgTable(
  'unsubscribe_tokens',
  {
    id: varchar({ length: maxLength.id }).notNull().$defaultFn(nanoid),
    userId: varchar({ length: maxLength.id })
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    secret: varchar({ length: maxLength.field }).notNull(),
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
