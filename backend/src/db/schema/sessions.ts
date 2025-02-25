import { pgTable, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampsColumn } from '#/db/utils/timestamp-columns';
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
  authStrategy: varchar({
    enum: ['github', 'google', 'microsoft', 'password', 'passkey'],
  }),
  type: varchar({
    enum: ['regular', 'impersonation'],
  })
    .notNull()
    .default('regular'),
  createdAt: timestampsColumn.createdAt,
  expiresAt: timestampsColumn.expiresAt,
});

export type SessionModel = typeof sessionsTable.$inferSelect;
export type InsertSessionModel = typeof sessionsTable.$inferInsert;
