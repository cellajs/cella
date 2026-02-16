import { pgTable, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

export const passwordsTable = pgTable('passwords', {
  id: varchar({ length: maxLength.id }).primaryKey().$defaultFn(nanoid),
  hashedPassword: varchar({ length: maxLength.field }).notNull(),
  userId: varchar({ length: maxLength.id })
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  createdAt: timestampColumns.createdAt,
  modifiedAt: timestampColumns.modifiedAt,
});

export type PasswordModel = typeof passwordsTable.$inferSelect;
export type InsertPasswordModel = typeof passwordsTable.$inferInsert;
