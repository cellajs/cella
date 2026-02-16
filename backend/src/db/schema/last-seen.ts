import { foreignKey, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { maxLength } from '#/db/utils/constraints';
import { usersTable } from './users';

/** Separated from users table to avoid triggering CDC on frequent updates. */
export const lastSeenTable = pgTable(
  'last_seen',
  {
    userId: varchar({ length: maxLength.id }).primaryKey(),
    lastSeenAt: timestamp({ mode: 'string' }),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersTable.id],
    }).onDelete('cascade'),
  ],
);

export type LastSeenModel = typeof lastSeenTable.$inferSelect;
export type InsertLastSeenModel = typeof lastSeenTable.$inferInsert;
