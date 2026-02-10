import { pgTable, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

export const passwordsTable = pgTable('passwords', {
  id: varchar().primaryKey().$defaultFn(nanoid),
  hashedPassword: varchar().notNull(),
  userId: varchar()
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  createdAt: timestampColumns.createdAt,
  modifiedAt: timestampColumns.modifiedAt,
});

export type PasswordModel = typeof passwordsTable.$inferSelect;
export type InsertPasswordModel = typeof passwordsTable.$inferInsert;
