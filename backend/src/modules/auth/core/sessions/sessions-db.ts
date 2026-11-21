import { sql } from 'drizzle-orm';
import { check, index, integer, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { writerColumn } from '#/db/utils/audit-columns';
import { maxLength } from '#/db/utils/constraints';
import type { UserId } from '#/db/utils/ids';
import { servedColumns } from '#/db/utils/served-columns';
import { isoTimestamp, timestampColumns } from '#/db/utils/timestamp-columns';
import { authStrategiesEnum, stepUpProofs } from '#/modules/auth/core/strategies';
import { connectionsTable } from '#/modules/connections/connections-db';
import { usersTable } from '#/modules/user/user-db';

/**
 * What a session stands for: `regular`, a sign-in; `mfa`, a sign-in with a second factor (an MFA challenge completed, or
 * MFA turned on).
 */
const sessionKinds = ['regular', 'mfa'] as const;
export type SessionKind = (typeof sessionKinds)[number];

/**
 * Why a session was revoked before its expiry. The user's acts: `sign_out` from the session itself, `other_session`
 * from another of their sessions, `mfa_enabled` because enabling MFA drops every other regular session. An
 * administrator's act: `admin_revoke`, by a system administrator for a person locked out or compromised, or by an
 * organization admin deleting the LTI connection a session came through. The server's housekeeping during a
 * sign-in: `session_cap` beyond `maxSessionsPerUser`, or beyond `maxEmbeddedSessionsPerUser` for an embedded session.
 * `replaced` by a newer session in the same browser: a sign-in, or the mfa session that enabling MFA mints.
 */
const sessionRevocationReasons = ['sign_out', 'other_session', 'mfa_enabled', 'admin_revoke', 'session_cap', 'replaced'] as const;
export type SessionRevocationReason = (typeof sessionRevocationReasons)[number];

/**
 * Authenticated session data. `secretHash` holds the hash of the random token in the session's cookie, never the token. A
 * revoked session keeps its row, stamped with `revokedAt`, so the sessions list shows what ended and why; expiry needs
 * no stamp. Expired rows are swept nightly by apply_retention() (`appConfig.retention`).
 */
export const sessionsTable = snakeCase.table(
  'sessions',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    secretHash: varchar({ length: maxLength.field }).notNull(),
    kind: varchar({ enum: sessionKinds }).notNull().default('regular'),
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
    /** The connection (an institution's trust) an SSO sign-in or an LTI launch came through; null for every other method. */
    connectionId: uuid().references(() => connectionsTable.id, { onDelete: 'set null' }),
    ipHash: varchar({ length: 64 }),
    ipSubnetHash: varchar({ length: 64 }),
    ipRegionCode: varchar({ length: 2 }),
    ipAsn: integer(),
    deviceIdHash: varchar({ length: 64 }),
    /**
     * The hash of the browser key an LTI launch keeps in the partitioned cookie of the platform's site; null for an
     * ordinary session. The embedded session's token counts only beside that cookie.
     */
    browserKeyHash: varchar({ length: 64 }),
    createdAt: timestampColumns.createdAt,
    expiresAt: timestampColumns.expiresAt,
    revokedAt: isoTimestamp(),
    /** The actor whose request revoked the session; null when the server did it during a sign-in. */
    revokedBy: writerColumn(),
    revocationReason: varchar({ enum: sessionRevocationReasons }),
    /** When the session last proved its user's presence again (a step-up); account-security actions need it recent. */
    steppedUpAt: isoTimestamp(),
    steppedUpVia: varchar({ enum: stepUpProofs }),
    /** The hash of the step-up cookie the stamp went out with: the stamp counts only for a browser presenting that cookie. */
    steppedUpSecretHash: varchar({ length: maxLength.field }),
  },
  (table) => [
    index('sessions_secret_hash_idx').on(table.secretHash),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_user_id_ip_hash_idx').on(table.userId, table.ipHash),
    index('sessions_ip_subnet_hash_idx').on(table.ipSubnetHash),
    index('sessions_user_id_device_id_hash_idx').on(table.userId, table.deviceIdHash),
    check('sessions_revocation_reason_check', sql`(${table.revokedAt} IS NULL) = (${table.revocationReason} IS NULL)`),
  ],
);

/** Every column but the secrets: what any response may carry. */
export const sessionSafeColumns = servedColumns(sessionsTable);

const { id, userId, kind, authStrategy, connectionId, createdAt, expiresAt } = sessionSafeColumns;
/** The columns of {@link SessionFacts}. */
export const sessionFactColumns = { id, userId, kind, authStrategy, connectionId, createdAt, expiresAt };

/** A session row without its secrets. */
export type SessionModel = Omit<typeof sessionsTable.$inferSelect, 'secretHash' | 'steppedUpSecretHash' | 'browserKeyHash'>;

/** What the guards know about a session: fixed when it was created, so the auth cache may hold them until it ends. */
export type SessionFacts = Pick<SessionModel, keyof typeof sessionFactColumns>;

export type InsertSessionModel = typeof sessionsTable.$inferInsert;
