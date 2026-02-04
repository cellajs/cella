import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Rate limits table for rate-limiter-flexible with RateLimiterDrizzle.
 * Schema follows the required structure from the library docs.
 */
export const rateLimitsTable = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  points: integer('points').notNull(),
  expire: timestamp('expire'),
});
