import { config } from 'config';
import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { organizationsTable } from './organizations';

const tokenTypeEnum = ['email_verification', 'password_reset', 'system_invitation', 'membership_invitation'] as const;
const roleEnum = config.rolesByType.allRoles;

export const tokensTable = pgTable('tokens', {
  id: varchar().primaryKey(),
  type: varchar({ enum: tokenTypeEnum }).notNull(),
  email: varchar(),
  role: varchar({ enum: roleEnum }),
  userId: varchar().references(() => usersTable.id, { onDelete: 'cascade' }),
  organizationId: varchar().references(() => organizationsTable.id, { onDelete: 'cascade' }),
  createdAt: timestamp().defaultNow().notNull(),
  expiresAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
});

export type TokenModel = typeof tokensTable.$inferSelect;
export type InsertTokenModel = typeof tokensTable.$inferInsert;
