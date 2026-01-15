import { foreignKey, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from './users';

/**
 * Last seen table for tracking user presence.
 * Separated from users table to avoid triggering CDC on frequent updates.
 *
 * @link http://localhost:4000/docs#tag/users
 */
export const lastSeenTable = pgTable(
  'last_seen',
  {
    userId: varchar().primaryKey(), // One record per user
    lastSeenAt: timestamp({ mode: 'string' }), // Last time a GET request was made (throttled to 5 min intervals)
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
