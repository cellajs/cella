import { boolean, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

/** Users can have multiple emails. tokenId has no FK constraint (tokens is partitioned). */
export const emailsTable = pgTable('emails', {
  createdAt: timestampColumns.createdAt,
  id: varchar().primaryKey().$defaultFn(nanoid),
  email: varchar().notNull().unique(),
  verified: boolean().notNull().default(false),
  tokenId: varchar(), // References tokens.id logically (no FK due to partitioning)
  userId: varchar()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  verifiedAt: timestamp({ mode: 'string' }),
});

export type EmailModel = typeof emailsTable.$inferSelect;
export type InsertEmailModel = typeof emailsTable.$inferInsert;
