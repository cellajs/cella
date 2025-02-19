import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { nanoid } from '#/utils/nanoid';

export const sessionsTable = pgTable('sessions', {
  id: varchar().primaryKey().$defaultFn(nanoid),
  token: varchar().notNull(),
  userId: varchar()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  deviceName: varchar(),
  deviceType: varchar({ enum: ['desktop', 'mobile'] })
    .notNull()
    .default('desktop'),
  deviceOs: varchar(),
  browser: varchar(),
  // TODO use enum from config?
  authStrategy: varchar({
    enum: ['github', 'google', 'microsoft', 'password', 'passkey'],
  }),
  type: varchar({
    enum: ['regular', 'impersonation'],
  })
    .notNull()
    .default('regular'),
  createdAt: timestamp().defaultNow().notNull(),
  expiresAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
});

export type SessionModel = typeof sessionsTable.$inferSelect;
export type InsertSessionModel = typeof sessionsTable.$inferInsert;
