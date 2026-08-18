import { timestamp } from 'drizzle-orm/pg-core';

export const timestampColumns = {
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: 'string' }),
  expiresAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
};
