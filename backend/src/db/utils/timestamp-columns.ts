import { timestamp } from 'drizzle-orm/pg-core';

export const timestampsColumn = {
  baseString: timestamp({ mode: 'string' }),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  expiresAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
};
