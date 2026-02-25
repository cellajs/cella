import { boolean, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from 'shared/nanoid';
import { usersTable } from '#/db/schema/users';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';

/** Users can have multiple emails. tokenId has no FK constraint (tokens is partitioned). */
export const emailsTable = pgTable('emails', {
  createdAt: timestampColumns.createdAt,
  id: varchar({ length: maxLength.id }).primaryKey().$defaultFn(nanoid),
  email: varchar({ length: maxLength.field }).notNull().unique(),
  verified: boolean().notNull().default(false),
  tokenId: varchar({ length: maxLength.id }), // References tokens.id logically (no FK due to partitioning)
  userId: varchar({ length: maxLength.id })
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  verifiedAt: timestamp({ mode: 'string' }),
});

export type EmailModel = typeof emailsTable.$inferSelect;
export type InsertEmailModel = typeof emailsTable.$inferInsert;
