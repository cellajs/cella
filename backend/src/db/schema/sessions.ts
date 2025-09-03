import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

export const sessionTypeEnum = [
  'regular',
  'impersonation',
  'pending_2fa', // User completed password step, waiting for 2FA
  'two_factor_authentication', // User fully authenticated with 2FA
] as const;
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
  consumedAt: timestamp({ withTimezone: true, mode: 'date' }),
});

export type SessionModel = typeof sessionsTable.$inferSelect;
export type InsertSessionModel = typeof sessionsTable.$inferInsert;
