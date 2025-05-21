import { timestamp } from 'drizzle-orm/pg-core';

/**
 * Common timestamp columns used in various tables.
 * It helps to maintain consistency and avoid code duplication.
 */
export const timestampColumns = {
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  modifiedAt: timestamp({ mode: 'string' }),
  expiresAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
};
