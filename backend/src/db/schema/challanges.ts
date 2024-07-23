import { relations } from 'drizzle-orm';
import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '../../lib/nanoid';
import { usersTable } from './users';

export const challengeTable = pgTable('challenges', {
  id: varchar('id').primaryKey().$defaultFn(nanoid),
  userId: varchar('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  challenge: varchar('challenge').notNull(),
});

export const passkeyTableRelations = relations(challengeTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [challengeTable.userId],
    references: [usersTable.id],
  }),
}));
