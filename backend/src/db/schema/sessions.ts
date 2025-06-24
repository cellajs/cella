import { pgTable, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';


export const sessionTypeEnum = ['regular', 'impersonation'] as const;
export const authStrategiesEnum = ['github', 'google', 'microsoft', 'password', 'passkey', 'email'] as const;

export const sessionsTable = pgTable('sessions', {
  id: varchar().primaryKey().$defaultFn(nanoid),
  token: varchar().notNull(),
  type: varchar({
    enum: sessionTypeEnum,
  })
    .notNull()
    .default('regular'),
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
    enum: authStrategiesEnum,
  }).notNull(),
  createdAt: timestampColumns.createdAt,
  expiresAt: timestampColumns.expiresAt,
});

export type SessionModel = typeof sessionsTable.$inferSelect;
export type InsertSessionModel = typeof sessionsTable.$inferInsert;
