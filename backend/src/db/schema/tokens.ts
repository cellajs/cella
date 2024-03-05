import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { organizationsTable } from './organizations';
import { usersTable } from './users';

const tokenTypeEnum = ['EMAIL_VERIFICATION', 'PASSWORD_RESET', 'INVITATION'] as const;

export const tokensTable = pgTable('tokens', {
  id: varchar('id').primaryKey(),
  type: varchar('type', { enum: tokenTypeEnum }).notNull(),
  email: varchar('email'),
  userId: varchar('user_id').references(() => usersTable.id, { onDelete: 'cascade' }),
  organizationId: varchar('organization_id').references(() => organizationsTable.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
});
