import { pgTable, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

export const sessionTypeEnum = [
  'regular',
  'impersonation',
  'mfa', // User fully authenticated with MFA
] as const;
export type SessionTypes = (typeof sessionTypeEnum)[number];

export const authStrategiesEnum = ['github', 'google', 'microsoft', 'password', 'passkey', 'totp', 'email'] as const;
export type AuthStrategy = (typeof authStrategiesEnum)[number];

/**
 * Sessions table to store authenticated session data.
 */
export const sessionsTable = pgTable('sessions', {
  createdAt: timestampColumns.createdAt,
  id: varchar().primaryKey().$defaultFn(nanoid),
  token: varchar().notNull(),
  type: varchar({ enum: sessionTypeEnum }).notNull().default('regular'),
  userId: varchar()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  deviceName: varchar(),
  deviceType: varchar({ enum: ['desktop', 'mobile'] })
    .notNull()
    .default('desktop'),
  deviceOs: varchar(),
  browser: varchar(),
  authStrategy: varchar({ enum: authStrategiesEnum }).notNull(),
  expiresAt: timestampColumns.expiresAt,
});

export type SessionModel = typeof sessionsTable.$inferSelect;
