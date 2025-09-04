import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';
import { pgTable, varchar } from 'drizzle-orm/pg-core';

export const totpsTable = pgTable('totps', {
  id: varchar().primaryKey().$defaultFn(nanoid),
  userId: varchar()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  encoderSecretKey: varchar().notNull(),
  createdAt: timestampColumns.createdAt,
});

export type TotpModel = typeof totpsTable.$inferSelect;
export type InsertTotpModel = typeof totpsTable.$inferInsert;
