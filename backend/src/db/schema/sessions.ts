import { index, pgTable, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

export const sessionTypeEnum = ['regular', 'impersonation', 'mfa'] as const;
export type SessionTypes = (typeof sessionTypeEnum)[number];

export const authStrategiesEnum = ['github', 'google', 'microsoft', 'password', 'passkey', 'totp', 'email'] as const;
export type AuthStrategy = (typeof authStrategiesEnum)[number];

/**
 * Sessions table to store authenticated session data.
 */
export const sessionsTable = pgTable(
  'sessions',
  {
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
  },
  (table) => [index('sessions_token_idx').on(table.token)],
);

/** Raw session model including sensitive token field - use only when token access is required. */
export type UnsafeSessionModel = typeof sessionsTable.$inferSelect;

/** Safe session model with token omitted for general use. */
export type SessionModel = Omit<UnsafeSessionModel, 'token'>;

export type InsertSessionModel = typeof sessionsTable.$inferInsert;
