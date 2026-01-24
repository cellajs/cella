import { boolean, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

/**
 * Emails table. Users can have multiple emails, each needing verification.
 * tokenId references tokens table but without FK constraint (tokens is partitioned by expiresAt,
 * and PostgreSQL doesn't support FK to partitioned tables unless including the partition key).
 */
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
