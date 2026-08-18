import { integer, snakeCase, text, timestamp } from 'drizzle-orm/pg-core';

/** Rate limits for rate-limiter-flexible with RateLimiterDrizzle; the column shape is fixed by the library. */
export const rateLimitsTable = snakeCase.table('rate_limits', {
  key: text('key').primaryKey(),
  points: integer('points').notNull(),
  expire: timestamp('expire'),
});
