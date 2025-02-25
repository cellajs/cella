import { timestamp } from 'drizzle-orm/pg-core';

export const timestampsColumn = {
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  modifiedAt: timestamp({ mode: 'string' }),
  expiresAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
};
