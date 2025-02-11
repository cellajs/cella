import { config } from 'config';
import { timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { generateContextEntityFields, generateTable } from '#/db/utils';
import { nanoid } from '#/utils/nanoid';

const tokenTypeEnum = config.tokenTypes;
const roleEnum = config.rolesByType.entityRoles;

const baseColumns = {
  id: varchar().primaryKey().$defaultFn(nanoid),
  token: varchar().notNull(),
  type: varchar({ enum: tokenTypeEnum }).notNull(),
  email: varchar().notNull(),
  entity: varchar({ enum: config.contextEntityTypes }),
  role: varchar({ enum: roleEnum }),
  userId: varchar().references(() => usersTable.id, { onDelete: 'cascade' }),
  createdAt: timestamp().defaultNow().notNull(),
  createdBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
  expiresAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
};

// Generate entity id columns based on entity-config
const additionalColumns = generateContextEntityFields();
export const tokensTable = generateTable('tokens', baseColumns, additionalColumns);

export type TokenModel = typeof tokensTable.$inferSelect;
export type InsertTokenModel = typeof tokensTable.$inferInsert;
