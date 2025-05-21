import { boolean, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';
import { tokensTable } from './tokens';

export const emailsTable = pgTable('emails', {
  id: varchar().primaryKey().$defaultFn(nanoid),
  email: varchar().notNull().unique(),
  verified: boolean().notNull().default(false),
  tokenId: varchar().references(() => tokensTable.id, { onDelete: 'set null' }),
  userId: varchar()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  createdAt: timestampColumns.createdAt,
  verifiedAt: timestamp({ mode: 'string' }),
});

export type EmailsModel = typeof emailsTable.$inferSelect;
export type InsertEmailModel = typeof emailsTable.$inferInsert;
