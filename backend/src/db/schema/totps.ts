import { pgTable, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

export const totpsTable = pgTable('totps', {
  id: varchar().primaryKey().$defaultFn(nanoid),
  userId: varchar()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  secret: varchar().notNull(),
  createdAt: timestampColumns.createdAt,
});

export type TOTPModel = typeof totpsTable.$inferSelect;
export type InsertTOTPModel = typeof totpsTable.$inferInsert;
