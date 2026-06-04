import { index, integer, primaryKey, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/entity-id';
import { usersTable } from '#/db/schema/users';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';

export const sessionTypeEnum = ['regular', 'impersonation', 'mfa'] as const;
export type SessionTypes = (typeof sessionTypeEnum)[number];

export const authStrategiesEnum = ['github', 'google', 'microsoft', 'passkey', 'totp', 'email', 'magic'] as const;
export type AuthStrategy = (typeof authStrategiesEnum)[number];

/**
 * Authenticated session data.
 *
 * PARTITIONING: Partitioned by expiresAt via pg_partman (weekly, 30-day retention).
 * Drizzle sees a regular table; PostgreSQL manages partitions transparently.
 */
export const sessionsTable = snakeCase.table(
  'sessions',
  {
    id: uuid().notNull().$defaultFn(generateId),
    secret: varchar({ length: maxLength.field }).notNull(),
    type: varchar({ enum: sessionTypeEnum }).notNull().default('regular'),
    userId: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    deviceName: varchar({ length: maxLength.field }),
    deviceType: varchar({ enum: ['desktop', 'mobile'] })
      .notNull()
      .default('desktop'),
    deviceOs: varchar({ length: maxLength.field }),
    browser: varchar({ length: maxLength.field }),
    authStrategy: varchar({ enum: authStrategiesEnum }).notNull(),
    // Pseudonymized network identity. Raw IP is never persisted.
    // ipHash: per-user HMAC of the IP — supports "have I seen this IP for this user?" checks (MFA trust).
    // ipSubnetHash: global HMAC of the /24 (v4) or /48 (v6) — supports cross-user blocklist matching.
    // ipCountry / ipAsn: derived from GeoIP at session creation, used for geo-aware MFA and bot defense.
    ipHash: varchar({ length: 64 }),
    ipSubnetHash: varchar({ length: 64 }),
    ipCountry: varchar({ length: 2 }),
    ipAsn: integer(),
    createdAt: timestampColumns.createdAt,
    expiresAt: timestampColumns.expiresAt,
  },
  (table) => [
    primaryKey({ columns: [table.id, table.expiresAt] }),
    index('sessions_secret_idx').on(table.secret),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_user_id_ip_hash_idx').on(table.userId, table.ipHash),
    index('sessions_ip_subnet_hash_idx').on(table.ipSubnetHash),
  ],
);

/** Raw session model including sensitive secret field - use only when secret access is required. */
export type UnsafeSessionModel = typeof sessionsTable.$inferSelect;

/** Safe session model with secret omitted for general use. */
export type SessionModel = Omit<UnsafeSessionModel, 'secret'>;

export type InsertSessionModel = typeof sessionsTable.$inferInsert;
