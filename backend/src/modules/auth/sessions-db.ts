import { getTableColumns } from 'drizzle-orm';
import { type AnyPgColumn, index, integer, snakeCase, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { maxLength } from '#/db/utils/constraints';
import type { ActorId, UserId } from '#/db/utils/ids';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { actorsTable } from '#/modules/actors/actors-db';
import { usersTable } from '#/modules/user/user-db';

export const sessionTypeEnum = ['regular', 'impersonation', 'mfa'] as const;
export type SessionTypes = (typeof sessionTypeEnum)[number];

export const authStrategiesEnum = ['github', 'google', 'microsoft', 'passkey', 'totp', 'email', 'magic'] as const;
export type AuthStrategy = (typeof authStrategiesEnum)[number];

/**
 * Why a session was revoked before its expiry. The owner's acts: `sign_out` from the session itself, `other_session`
 * from another of their sessions, `mfa_enabled` because enabling MFA drops every other regular session. The server's
 * housekeeping during a sign-in: `session_cap` beyond `maxSessionsPerUser`. `replaced` by a newer session in the same
 * browser: a sign-in, or the mfa session that enabling MFA mints. `impersonation_stopped` when the admin stops.
 */
export const sessionRevocationReasons = [
  'sign_out',
  'other_session',
  'mfa_enabled',
  'session_cap',
  'replaced',
  'impersonation_stopped',
] as const;
export type SessionRevocationReason = (typeof sessionRevocationReasons)[number];

/** Why sessions end: a revocation, or `user_deleted`, whose delete takes the session rows along. */
export type SessionEndReason = SessionRevocationReason | 'user_deleted';

/** How a session last proved its user's presence again: a second factor, or an emailed link for a user without one. */
export const stepUpProofs = ['passkey', 'totp', 'email'] as const;
export type StepUpProof = (typeof stepUpProofs)[number];

/**
 * Authenticated session data. `secret` holds the hash of the random token in the session's cookie, never the token. A
 * revoked session keeps its row, stamped with `revokedAt`, so the sessions list shows what ended and why; expiry needs
 * no stamp. Rows expired for over 30 days are swept nightly by maintain_partitions().
 */
export const sessionsTable = snakeCase.table(
  'sessions',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    secret: varchar({ length: maxLength.field }).notNull(),
    type: varchar({ enum: sessionTypeEnum }).notNull().default('regular'),
    userId: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' })
      .$type<UserId>(),
    deviceName: varchar({ length: maxLength.field }),
    deviceType: varchar({ enum: ['desktop', 'mobile'] })
      .notNull()
      .default('desktop'),
    deviceOs: varchar({ length: maxLength.field }),
    browser: varchar({ length: maxLength.field }),
    authStrategy: varchar({ enum: authStrategiesEnum }).notNull(),
    ipHash: varchar({ length: 64 }),
    ipSubnetHash: varchar({ length: 64 }),
    ipCountry: varchar({ length: 2 }),
    ipAsn: integer(),
    deviceIdHash: varchar({ length: 64 }),
    createdAt: timestampColumns.createdAt,
    expiresAt: timestampColumns.expiresAt,
    revokedAt: timestamp({ mode: 'string' }),
    /** The actor whose request revoked the session; null when the server did it during a sign-in. */
    revokedBy: uuid()
      .references(() => actorsTable.id, { onDelete: 'set null' })
      .$type<ActorId>(),
    revocationReason: varchar({ enum: sessionRevocationReasons }),
    /** An impersonation's admin session: where the admin's browser returns, and without which it never authenticates. */
    impersonatorSessionId: uuid().references((): AnyPgColumn => sessionsTable.id, { onDelete: 'cascade' }),
    /** When the session last proved its user's presence again (a step-up); account-security actions need it recent. */
    steppedUpAt: timestamp({ withTimezone: true, mode: 'string' }),
    steppedUpVia: varchar({ enum: stepUpProofs }),
  },
  (table) => [
    index('sessions_secret_idx').on(table.secret),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_user_id_ip_hash_idx').on(table.userId, table.ipHash),
    index('sessions_ip_subnet_hash_idx').on(table.ipSubnetHash),
    index('sessions_user_id_device_id_hash_idx').on(table.userId, table.deviceIdHash),
  ],
);

const { secret: _secret, ...safeColumns } = getTableColumns(sessionsTable);
/** Every column but the secret: what any response may carry. */
export const sessionSafeColumns = safeColumns;

const { id, userId, type, authStrategy, createdAt, expiresAt, impersonatorSessionId } = safeColumns;
/** The columns of {@link SessionFacts}. */
export const sessionFactColumns = { id, userId, type, authStrategy, createdAt, expiresAt, impersonatorSessionId };

/** Raw session model including sensitive secret field - use only when secret access is required. */
export type UnsafeSessionModel = typeof sessionsTable.$inferSelect;

/** Safe session model with secret omitted for general use. */
export type SessionModel = Omit<UnsafeSessionModel, 'secret'>;

/** What the guards know about a session: fixed when it was created, so the auth cache may hold them until it ends. */
export type SessionFacts = Pick<SessionModel, keyof typeof sessionFactColumns>;

export type InsertSessionModel = typeof sessionsTable.$inferInsert;
