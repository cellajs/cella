import { config } from 'config';
import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { organizationsTable } from './organizations';

const tokenTypeEnum = ['email_verification', 'password_reset', 'system_invitation', 'membership_invitation'] as const;
const roleEnum = config.rolesByType.allRoles;

export const tokensTable = pgTable('tokens', {
  id: varchar('id').primaryKey(),
  type: varchar('type', { enum: tokenTypeEnum }).notNull(),
  email: varchar('email'),
  role: varchar('role', { enum: roleEnum }),
  userId: varchar('user_id').references(() => usersTable.id, { onDelete: 'cascade' }),
  organizationId: varchar('organization_id').references(() => organizationsTable.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
});

export type TokenModel = typeof tokensTable.$inferSelect;
export type InsertTokenModel = typeof tokensTable.$inferInsert;
