import { config } from 'config';
import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { nanoid } from '#/utils/nanoid';
import { organizationsTable } from './organizations';

export const tokenTypeEnum = ['email_verification', 'password_reset', 'invitation'] as const;
const roleEnum = config.rolesByType.entityRoles;

export const tokensTable = pgTable('tokens', {
  id: varchar().primaryKey().$defaultFn(nanoid),
  token: varchar().notNull(),
  type: varchar({ enum: tokenTypeEnum }).notNull(),
  email: varchar().notNull(),
  role: varchar({ enum: roleEnum }),
  userId: varchar().references(() => usersTable.id, { onDelete: 'cascade' }),
  organizationId: varchar().references(() => organizationsTable.id, { onDelete: 'cascade' }),
  createdAt: timestamp().defaultNow().notNull(),
  createdBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
  expiresAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
});

export type TokenModel = typeof tokensTable.$inferSelect;
export type InsertTokenModel = typeof tokensTable.$inferInsert;
