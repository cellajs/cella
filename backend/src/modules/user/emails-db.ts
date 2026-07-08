import { boolean, index, snakeCase, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { usersTable } from '#/modules/user/user-db';

/** Users can have multiple emails. tokenId has no FK constraint (tokens is partitioned). */
export const emailsTable = snakeCase.table(
  'emails',
  {
    createdAt: timestampColumns.createdAt,
    id: uuid().primaryKey().$defaultFn(generateId),
    email: varchar({ length: maxLength.field }).notNull().unique(),
    verified: boolean().notNull().default(false),
    tokenId: uuid(), // References tokens.id logically (no FK due to partitioning)
    userId: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    verifiedAt: timestamp({ mode: 'string' }),
  },
  (table) => [index('emails_user_id_idx').on(table.userId)],
);

export type EmailModel = typeof emailsTable.$inferSelect;
export type InsertEmailModel = typeof emailsTable.$inferInsert;
