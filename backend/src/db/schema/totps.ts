import { pgTable, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from 'shared/nanoid';
import { usersTable } from '#/db/schema/users';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';

export const totpsTable = pgTable('totps', {
  id: varchar({ length: maxLength.id }).primaryKey().$defaultFn(nanoid),
  userId: varchar({ length: maxLength.id })
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  secret: varchar({ length: maxLength.field }).notNull(),
  createdAt: timestampColumns.createdAt,
});

export type TOTPModel = typeof totpsTable.$inferSelect;
export type InsertTOTPModel = typeof totpsTable.$inferInsert;
