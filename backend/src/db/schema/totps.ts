import { index, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/entity-id';
import { usersTable } from '#/db/schema/users';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';

export const totpsTable = snakeCase.table(
  'totps',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    userId: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    secret: varchar({ length: maxLength.field }).notNull(),
    createdAt: timestampColumns.createdAt,
  },
  (table) => [index('totps_user_id_idx').on(table.userId)],
);

export type TOTPModel = typeof totpsTable.$inferSelect;
export type InsertTOTPModel = typeof totpsTable.$inferInsert;
