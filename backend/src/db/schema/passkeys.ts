import { pgTable, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

export const passkeysTable = pgTable('passkeys', {
  id: varchar().primaryKey().$defaultFn(nanoid),
  userEmail: varchar()
    .notNull()
    .references(() => usersTable.email, { onDelete: 'cascade' }),
  credentialId: varchar().notNull(),
  publicKey: varchar().notNull(),
  createdAt: timestampColumns.createdAt,
});

export type PasskeyModel = typeof passkeysTable.$inferSelect;
export type InsertPasskeyModel = typeof passkeysTable.$inferInsert;
