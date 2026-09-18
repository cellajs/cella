import { boolean, index, snakeCase, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { usersTable } from '#/modules/user/user-db';

/**
 * The inboxes proven to belong to an account: the sign-up address, plus any address whose verification link was clicked
 * (an OAuth connect on another address). A row is written only by such a proof, never on a provider's word alone, and
 * never deleted as a side effect. Every row is a magic-link sign-in identifier. `users.email` stays the primary.
 * tokenId has no FK constraint (tokens is partitioned).
 */
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
    verifiedAt: timestamp({ mode: 'string' }), // First inbox proof
    lastVerifiedBy: varchar({ length: maxLength.field }), // Most recent proof: 'magic' or the provider whose verification link was clicked
    lastVerifiedAt: timestamp({ mode: 'string' }),
  },
  (table) => [index('emails_user_id_idx').on(table.userId)],
);

export type EmailModel = typeof emailsTable.$inferSelect;
export type InsertEmailModel = typeof emailsTable.$inferInsert;
