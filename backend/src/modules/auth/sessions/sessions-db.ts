import { getColumns, sql } from 'drizzle-orm';
import { type AnyPgColumn, index, integer, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig, type FederationKey } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { maxLength } from '#/db/utils/constraints';
import type { ActorId, UserId } from '#/db/utils/ids';
import { isoTimestamp, timestampColumns } from '#/db/utils/timestamp-columns';
import { actorsTable } from '#/modules/actors/actors-db';
import { connectionsTable } from '#/modules/connections/connections-db';
import { usersTable } from '#/modules/user/user-db';

/**
 * What a session stands for: `regular`, a sign-in; `mfa`, a sign-in with a second factor (an MFA challenge completed, or
 * MFA turned on); `impersonation`, a system admin acting as the user, layered on the admin's session.
 */
const sessionTypes = ['regular', 'impersonation', 'mfa'] as const;
export type SessionType = (typeof sessionTypes)[number];

const baseAuthStrategies = ['github', 'google', 'microsoft', 'passkey', 'totp', 'email', 'magic'] as const;
/** A sign-in method as a session records it: a built-in one, or a federation key from `appConfig.federations`. */
export type AuthStrategy = (typeof baseAuthStrategies)[number] | FederationKey;
/** Every {@link AuthStrategy}: the enum of the columns and request fields that hold one. */
export const authStrategiesEnum = [...baseAuthStrategies, ...(Object.keys(appConfig.federations) as FederationKey[])] as [
  AuthStrategy,
  ...AuthStrategy[],
];

/**
 * Why a session was revoked before its expiry. The user's acts: `sign_out` from the session itself, `other_session`
 * from another of their sessions, `mfa_enabled` because enabling MFA drops every other regular session. The server's
 * housekeeping during a sign-in: `session_cap` beyond `maxSessionsPerUser`. `replaced` by a newer session in the same
 * browser: a sign-in, or the mfa session that enabling MFA mints. `impersonation_stopped` when the admin stops.
 */
const sessionRevocationReasons = ['sign_out', 'other_session', 'mfa_enabled', 'session_cap', 'replaced', 'impersonation_stopped'] as const;
export type SessionRevocationReason = (typeof sessionRevocationReasons)[number];

/** Why sessions end: a revocation, or `user_deleted`, whose delete takes the session rows along. */
export type SessionEndReason = SessionRevocationReason | 'user_deleted';

/**
 * How a session last proved its user's presence again: a second factor (a step-up, or the MFA completion that minted the
 * session), or an emailed link for a user without one.
 */
const stepUpProofs = ['passkey', 'totp', 'email'] as const;
export type StepUpProof = (typeof stepUpProofs)[number];

/**
 * Authenticated session data. `secret` holds the hash of the random token in the session's cookie, never the token. A
 * revoked session keeps its row, stamped with `revokedAt`, so the sessions list shows what ended and why; expiry needs
 * no stamp. Expired rows are swept nightly by apply_retention() (`appConfig.retention`).
 */
export const sessionsTable = snakeCase.table(
  'sessions',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    secret: varchar({ length: maxLength.field }).notNull(),
    type: varchar({ enum: sessionTypes }).notNull().default('regular'),
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
    /** The method that started the sign-in. A second factor never replaces it: an MFA completion stamps `steppedUpVia`. */
    authStrategy: varchar({ enum: authStrategiesEnum }).notNull(),
    /** The connection (an institution's trust) an SSO sign-in came through; null for every other method. */
    connectionId: uuid().references(() => connectionsTable.id, { onDelete: 'set null' }),
    ipHash: varchar({ length: 64 }),
    ipSubnetHash: varchar({ length: 64 }),
    ipCountry: varchar({ length: 2 }),
    ipAsn: integer(),
    deviceIdHash: varchar({ length: 64 }),
    createdAt: timestampColumns.createdAt,
    expiresAt: timestampColumns.expiresAt,
    revokedAt: isoTimestamp(),
    /** The actor whose request revoked the session; null when the server did it during a sign-in. */
    revokedBy: uuid()
      .references(() => actorsTable.id, { onDelete: 'set null' })
      .$type<ActorId>(),
    revocationReason: varchar({ enum: sessionRevocationReasons }),
    /** The admin session an impersonation is layered on: it authenticates only while that session is presented with it and live, and ends with it. */
    impersonatorSessionId: uuid().references((): AnyPgColumn => sessionsTable.id, { onDelete: 'cascade' }),
    /** When the session last proved its user's presence again (a step-up); account-security actions need it recent. */
    steppedUpAt: isoTimestamp(),
    steppedUpVia: varchar({ enum: stepUpProofs }),
  },
  (table) => [
    index('sessions_secret_idx').on(table.secret),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_user_id_ip_hash_idx').on(table.userId, table.ipHash),
    index('sessions_ip_subnet_hash_idx').on(table.ipSubnetHash),
    index('sessions_user_id_device_id_hash_idx').on(table.userId, table.deviceIdHash),
    // Impersonations are found by their admin's session when it ends or is deleted; other rows hold null.
    index('sessions_impersonator_session_id_idx').on(table.impersonatorSessionId).where(sql`${table.impersonatorSessionId} is not null`),
  ],
);

const { secret: _secret, ...safeColumns } = getColumns(sessionsTable);
/** Every column but the secret: what any response may carry. */
export const sessionSafeColumns = safeColumns;

const { id, userId, type, authStrategy, connectionId, createdAt, expiresAt, impersonatorSessionId } = safeColumns;
/** The columns of {@link SessionFacts}. */
export const sessionFactColumns = { id, userId, type, authStrategy, connectionId, createdAt, expiresAt, impersonatorSessionId };

/** A session row without its secret. */
export type SessionModel = Omit<typeof sessionsTable.$inferSelect, 'secret'>;

/** What the guards know about a session: fixed when it was created, so the auth cache may hold them until it ends. */
export type SessionFacts = Pick<SessionModel, keyof typeof sessionFactColumns>;

export type InsertSessionModel = typeof sessionsTable.$inferInsert;
