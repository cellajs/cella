import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { usersTable } from './users';

export const sessionsTable = pgTable('sessions', {
  id: uuid('id').primaryKey(),  // Lucia doesn't support default database values.
  userId: uuid('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
});
