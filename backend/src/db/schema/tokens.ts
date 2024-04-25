import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { organizationsTable } from './organizations';
import { usersTable } from './users';
import { sql } from 'drizzle-orm';

const tokenTypeEnum = ['EMAIL_VERIFICATION', 'PASSWORD_RESET', 'SYSTEM_INVITATION', 'ORGANIZATION_INVITATION'] as const;

export const tokensTable = pgTable('tokens', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  type: varchar('type', { enum: tokenTypeEnum }).notNull(),
  email: varchar('email'),
  role: varchar('role', {
    enum: ['ADMIN', 'USER', 'MEMBER'],
  }),
  userId: uuid('user_id').references(() => usersTable.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').references(() => organizationsTable.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
});
