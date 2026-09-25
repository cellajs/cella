import { index, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { maxLength } from '#/db/utils/constraints';
import type { UserId } from '#/db/utils/ids';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { usersTable } from '#/modules/user/user-db';

/** Email unsubscribe tokens, multiple per user, old ones stay valid. Rows older than 90 days are swept nightly by maintain_partitions(). */
export const unsubscribeTokensTable = snakeCase.table(
  'unsubscribe_tokens',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    userId: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' })
      .$type<UserId>(),
    // SHA-256 hex of the token an unsubscribe link carries (`unsubscribeTokenRow`), never the token itself.
    secret: varchar({ length: maxLength.field }).notNull(),
    createdAt: timestampColumns.createdAt,
  },
  (table) => [
    index('unsubscribe_tokens_secret_idx').on(table.secret),
    index('unsubscribe_tokens_user_id_idx').on(table.userId),
  ],
);

export type UnsubscribeTokenModel = typeof unsubscribeTokensTable.$inferSelect;
export type InsertUnsubscribeTokenModel = typeof unsubscribeTokensTable.$inferInsert;
