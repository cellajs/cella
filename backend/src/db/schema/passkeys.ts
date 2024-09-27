import { relations } from 'drizzle-orm';
import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { nanoid } from '#/utils/nanoid';

export const passkeysTable = pgTable('passkeys', {
  id: varchar('id').primaryKey().$defaultFn(nanoid),
  userEmail: varchar('user_email')
    .notNull()
    .references(() => usersTable.email, { onDelete: 'cascade' }),
  credentialId: varchar('credential_id').notNull(),
  publicKey: varchar('public_key').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const passkeyTableRelations = relations(passkeysTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [passkeysTable.userEmail],
    references: [usersTable.email],
  }),
}));

export type PasskeyModel = typeof passkeysTable.$inferSelect;
export type InsertPasskeyModel = typeof passkeysTable.$inferInsert;
