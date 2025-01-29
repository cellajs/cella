import { config } from 'config';
import { timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { nanoid } from '#/utils/nanoid';
import { createDynamicTable, generateContextEntityDynamicFields } from './helpers';

export const tokenTypeEnum = ['email_verification', 'password_reset', 'invitation'] as const;
const roleEnum = config.rolesByType.entityRoles;

const baseColumns = {
  id: varchar().primaryKey().$defaultFn(nanoid),
  token: varchar().notNull(),
  type: varchar({ enum: tokenTypeEnum }).notNull(),
  email: varchar().notNull(),
  role: varchar({ enum: roleEnum }),
  userId: varchar().references(() => usersTable.id, { onDelete: 'cascade' }),
  createdAt: timestamp().defaultNow().notNull(),
  createdBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
  expiresAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
};
const additionalColumns = generateContextEntityDynamicFields();

export const tokensTable = createDynamicTable('tokens', baseColumns, additionalColumns);

export type TokenModel = typeof tokensTable.$inferSelect;
export type InsertTokenModel = typeof tokensTable.$inferInsert;
