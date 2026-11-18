import { sql } from 'drizzle-orm';
import { check, index, jsonb, snakeCase, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import type { UserId } from '#/db/utils/ids';
import { isoTimestamp, timestampColumns } from '#/db/utils/timestamp-columns';
import { sessionsTable } from '#/modules/auth/core/sessions/sessions-db';
import { authStrategiesEnum } from '#/modules/auth/core/strategies';
import { connectionsTable } from '#/modules/connections/connections-db';
import { ltiResourceLinksTable } from '#/modules/lti-platform/lti-resource-links-db';
import { invitationsTable } from '#/modules/memberships/invitations-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { identitiesTable } from '#/modules/user/identities-db';
import { usersTable } from '#/modules/user/user-db';

/**
 * An OAuth sign-up waiting on its verification mail: the provider account, and the profile the account starts with. No
 * account exists until the mailed link is clicked and the same provider account signs in again.
 */
export type PendingSignUp = {
  /** The identity's provider slug: the OAuth provider. */
  provider: string;
  /** The provider's subject for the account that signed up. */
  subject: string;
  name: string;
  slug: string;
  givenName: string;
  /** Absent when the provider asserts none. */
  familyName?: string;
};

/** One row per issued token, of any kind in `appConfig.tokenKinds`. Expired rows are swept nightly by apply_retention() (`appConfig.retention`). */
export const tokensTable = snakeCase.table(
  'tokens',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    secretHash: varchar({ length: maxLength.field }).notNull(),
    singleUseToken: varchar({ length: maxLength.field }),
    kind: varchar({ enum: appConfig.tokenKinds }).notNull(),
    /** The address the token was issued to; null on a handoff token, which goes to another system. */
    email: varchar({ length: maxLength.field }),
    /** For a handoff token: the tenant it acts for, such as the one whose connection a registration link stores. */
    tenantId: varchar({ length: tenantIdLength }).references(() => tenantsTable.id, { onDelete: 'cascade' }),
    userId: uuid()
      .references(() => usersTable.id, { onDelete: 'cascade' })
      .$type<UserId>(),
    identityId: uuid().references(() => identitiesTable.id, { onDelete: 'cascade' }),
    /** A membership invitation's link goes with its row, so no answered or deleted invitation keeps a live link. */
    invitationId: uuid().references(() => invitationsTable.id, { onDelete: 'cascade' }),
    /** For a sign-in link: the invitation the asking browser had followed, accepted at the click on any device. */
    followedInvitationId: uuid().references(() => invitationsTable.id, { onDelete: 'set null' }),
    redirectPath: varchar({ length: maxLength.field }),
    pendingSignUp: jsonb().$type<PendingSignUp>(),
    /** The session a token is bound to: a step-up link stamps only this session. */
    sessionId: uuid().references(() => sessionsTable.id, { onDelete: 'cascade' }),
    /** For a `confirm-mfa` challenge: the method the sign-in started with, which the mfa session it ends in records. */
    authStrategy: varchar({ enum: authStrategiesEnum }),
    /** For a `confirm-mfa` challenge of an SSO sign-in: the connection it came through, recorded on the mfa session too. */
    connectionId: uuid().references(() => connectionsTable.id, { onDelete: 'set null' }),
    /** For an `lti-launch` record: the resource link it launches. A removed placement takes its live launches along. */
    ltiResourceLinkId: uuid().references(() => ltiResourceLinksTable.id, { onDelete: 'cascade' }),
    createdBy: uuid()
      .references(() => usersTable.id, { onDelete: 'cascade' })
      .$type<UserId>(),
    createdAt: timestampColumns.createdAt,
    expiresAt: timestampColumns.expiresAt,
    redeemedAt: isoTimestamp(),
  },
  (table) => [
    index('tokens_secret_hash_kind_idx').on(table.secretHash, table.kind),
    index('tokens_user_id_idx').on(table.userId),
    index('tokens_created_by_idx').on(table.createdBy),
    index('tokens_single_use_token_idx').on(table.kind, table.singleUseToken),
    // Tokens are found by session when it is deleted or a session-bound token is replaced; most hold null.
    index('tokens_session_id_idx').on(table.sessionId).where(sql`${table.sessionId} is not null`),
    // The same for an invitation's tokens, when its row is deleted or a new link replaces them.
    index('tokens_invitation_id_idx').on(table.invitationId).where(sql`${table.invitationId} is not null`),
    index('tokens_followed_invitation_id_idx').on(table.followedInvitationId).where(sql`${table.followedInvitationId} is not null`),
    // One live step-up code per session: of two concurrent requests that both cleared the session's code, the later insert is refused.
    uniqueIndex('tokens_step_up_session_id_idx').on(table.sessionId).where(sql`${table.kind} = 'step-up'`),
    // A token is issued to an address or for a tenant, never both: reads type the one their kind carries as present.
    check('tokens_subject_check', sql`(${table.email} IS NULL) <> (${table.tenantId} IS NULL)`),
  ],
);

/** The full row, secret hashes included: only `tokens/` reads it. */
export type UnsafeTokenModel = typeof tokensTable.$inferSelect;
export type InsertTokenModel = typeof tokensTable.$inferInsert;
