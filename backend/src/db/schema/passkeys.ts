import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { nanoid } from '#/utils/nanoid';

export const passkeysTable = pgTable('passkeys', {
  id: varchar().primaryKey().$defaultFn(nanoid),
  userEmail: varchar()
    .notNull()
    .references(() => usersTable.email, { onDelete: 'cascade' }),
  credentialId: varchar().notNull(),
  publicKey: varchar().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});

export type PasskeyModel = typeof passkeysTable.$inferSelect;
export type InsertPasskeyModel = typeof passkeysTable.$inferInsert;
