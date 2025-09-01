import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';
import { pgTable, varchar } from 'drizzle-orm/pg-core';

export const sessionTypeEnum = ['regular', 'impersonation', 'multi_factor'] as const;
export type SessionTypes = (typeof sessionTypeEnum)[number];

export const authStrategiesEnum = ['github', 'google', 'microsoft', 'password', 'passkey', 'email'] as const;
export type AuthStrategy = (typeof authStrategiesEnum)[number];

export const sessionsTable = pgTable('sessions', {
  createdAt: timestampColumns.createdAt,
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
  expiresAt: timestampColumns.expiresAt,
});

export type SessionModel = typeof sessionsTable.$inferSelect;
export type InsertSessionModel = typeof sessionsTable.$inferInsert;
