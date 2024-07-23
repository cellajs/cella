import { relations } from 'drizzle-orm';
import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '../../lib/nanoid';
import { usersTable } from './users';

export const passkeyTable = pgTable('passkey', {
  id: varchar('id').primaryKey().$defaultFn(nanoid),
  userId: varchar('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  credentialId: varchar('credential_id').notNull(),
  publicKey: varchar('public_key').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const passkeyTableRelations = relations(passkeyTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [passkeyTable.userId],
    references: [usersTable.id],
  }),
}));

export type PasskeyModel = typeof passkeyTable.$inferSelect;
export type InsertPasskeyModel = typeof passkeyTable.$inferInsert;
