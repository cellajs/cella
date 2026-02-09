import { index, pgTable, primaryKey, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

export const sessionTypeEnum = ['regular', 'impersonation', 'mfa'] as const;
export type SessionTypes = (typeof sessionTypeEnum)[number];

export const authStrategiesEnum = ['github', 'google', 'microsoft', 'password', 'passkey', 'totp', 'email'] as const;
export type AuthStrategy = (typeof authStrategiesEnum)[number];

/**
 * Sessions table to store authenticated session data.
 *
 * PARTITIONING (production only):
 * - Partitioned by expiresAt via pg_partman (see 0002_partman_setup.sql)
 * - Weekly partitions, 30-day retention after expiry
 * - Drizzle sees regular table; PostgreSQL has partitioned table
 * - Standard ALTERs (ADD/DROP COLUMN, ADD INDEX) work normally
 */
export const sessionsTable = pgTable(
  'sessions',
  {
    id: varchar().notNull().$defaultFn(nanoid),
    secret: varchar().notNull(),
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
    createdAt: timestampColumns.createdAt,
    expiresAt: timestampColumns.expiresAt,
  },
  (table) => [
    primaryKey({ columns: [table.id, table.expiresAt] }),
    index('sessions_secret_idx').on(table.secret),
    index('sessions_user_id_idx').on(table.userId),
  ],
);

/** Raw session model including sensitive secret field - use only when secret access is required. */
export type UnsafeSessionModel = typeof sessionsTable.$inferSelect;

/** Safe session model with secret omitted for general use. */
export type SessionModel = Omit<UnsafeSessionModel, 'secret'>;

export type InsertSessionModel = typeof sessionsTable.$inferInsert;
