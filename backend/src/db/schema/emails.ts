import { boolean, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

/**
 * Emails table. Users can have multiple emails, each needing verification. They can be linked to tokens for verification purposes.
 */
export const emailsTable = pgTable('emails', {
  createdAt: timestampColumns.createdAt,
  id: varchar().primaryKey().$defaultFn(nanoid),
  email: varchar().notNull().unique(),
  verified: boolean().notNull().default(false),
  tokenId: varchar().references(() => tokensTable.id, { onDelete: 'set null' }),
  userId: varchar()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  verifiedAt: timestamp({ mode: 'string' }),
});

export type EmailModel = typeof emailsTable.$inferSelect;
export type InsertEmailModel = typeof emailsTable.$inferInsert;
