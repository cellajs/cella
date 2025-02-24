import { boolean, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { nanoid } from '#/utils/nanoid';
import { timestampsColumn } from '../utils';
import { tokensTable } from './tokens';

export const emailsTable = pgTable('emails', {
  id: varchar().primaryKey().$defaultFn(nanoid),
  email: varchar().notNull(),
  verified: boolean().notNull().default(false),
  tokenId: varchar().references(() => tokensTable.id, { onDelete: 'cascade' }),
  userId: varchar()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  createdAt: timestampsColumn.createdAt,
  verifiedAt: timestamp({ mode: 'string' }),
});

export type EmailsModel = typeof emailsTable.$inferSelect;
export type InsertEmailModel = typeof emailsTable.$inferInsert;
