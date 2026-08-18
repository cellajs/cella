import { snakeCase, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Per-user counters and timestamps, split from the users table to avoid CDC on frequent updates. */
export const userCountersTable = snakeCase.table('user_counters', {
  userId: uuid().primaryKey(),
  lastSeenAt: timestamp({ mode: 'string' }),
  lastStartedAt: timestamp({ mode: 'string' }), // Last time GET /me was called
  lastSignInAt: timestamp({ mode: 'string' }), // Last time user completed authentication flow
});

export type UserCounterModel = typeof userCountersTable.$inferSelect;
export type InsertUserCounterModel = typeof userCountersTable.$inferInsert;
