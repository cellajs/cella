import { foreignKey, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { maxLength } from '#/db/utils/constraints';
import { usersTable } from './users';

/** Separated from users table to avoid triggering CDC on frequent updates. */
export const userActivityTable = pgTable(
  'user_activity',
  {
    userId: varchar({ length: maxLength.id }).primaryKey(),
    lastSeenAt: timestamp({ mode: 'string' }),
    lastStartedAt: timestamp({ mode: 'string' }), // Last time GET /me was called
    lastSignInAt: timestamp({ mode: 'string' }), // Last time user completed authentication flow
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersTable.id],
    }).onDelete('cascade'),
  ],
);

export type UserActivityModel = typeof userActivityTable.$inferSelect;
export type InsertUserActivityModel = typeof userActivityTable.$inferInsert;
