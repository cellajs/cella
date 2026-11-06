import { sql } from 'drizzle-orm';
import { index, jsonb, snakeCase, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { maxLength } from '#/db/utils/constraints';
import type { UserId } from '#/db/utils/ids';
import { isoTimestamp, timestampColumns } from '#/db/utils/timestamp-columns';
import { identitiesTable } from '#/modules/auth/oauth/identities-db';
import { authStrategiesEnum, sessionsTable } from '#/modules/auth/sessions/sessions-db';
import { connectionsTable } from '#/modules/connections/connections-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { usersTable } from '#/modules/user/user-db';

/**
 * An OAuth sign-up waiting on its verification mail: the provider account, and the profile the account starts with. No
 * account exists until the mailed link is clicked and the same provider account signs in again.
 */
export type PendingSignUp = {
  /** The identity's issuer slug: the OAuth provider. */
  issuer: string;
  /** The provider's subject for the account that signed up. */
  subject: string;
  name: string;
  slug: string;
  firstName: string;
  /** Absent when the provider asserts none. */
  lastName?: string;
};

/** One row per issued token, of any type in `appConfig.tokenTypes`. Expired rows are swept nightly by apply_retention() (`appConfig.retention`). */
export const tokensTable = snakeCase.table(
  'tokens',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    secret: varchar({ length: maxLength.field }).notNull(),
    singleUseToken: varchar({ length: maxLength.field }),
    type: varchar({ enum: appConfig.tokenTypes }).notNull(),
    email: varchar({ length: maxLength.field }).notNull(),
    userId: uuid()
      .references(() => usersTable.id, { onDelete: 'cascade' })
      .$type<UserId>(),
    identityId: uuid().references(() => identitiesTable.id, { onDelete: 'cascade' }),
    /** A membership invitation's link goes with its row, so no answered or deleted invitation keeps a live link. */
    inactiveMembershipId: uuid().references(() => inactiveMembershipsTable.id, { onDelete: 'cascade' }),
    /** For a sign-in link: the invitation the asking browser had followed, accepted at the click on any device. */
    followedInvitationId: uuid().references(() => inactiveMembershipsTable.id, { onDelete: 'set null' }),
    redirectPath: varchar({ length: maxLength.field }),
    pendingSignUp: jsonb().$type<PendingSignUp>(),
    /** The session a token is bound to: a step-up link stamps only this session. */
    sessionId: uuid().references(() => sessionsTable.id, { onDelete: 'cascade' }),
    /** For a `confirm-mfa` challenge: the method the sign-in started with, which the mfa session it ends in records. */
    authStrategy: varchar({ enum: authStrategiesEnum }),
    /** For a `confirm-mfa` challenge of an SSO sign-in: the connection it came through, recorded on the mfa session too. */
    connectionId: uuid().references(() => connectionsTable.id, { onDelete: 'set null' }),
    createdBy: uuid()
      .references(() => usersTable.id, { onDelete: 'cascade' })
      .$type<UserId>(),
    createdAt: timestampColumns.createdAt,
    expiresAt: timestampColumns.expiresAt,
    invokedAt: isoTimestamp(),
  },
  (table) => [
    index('tokens_secret_type_idx').on(table.secret, table.type),
    index('tokens_user_id_idx').on(table.userId),
    index('tokens_created_by_idx').on(table.createdBy),
    index('tokens_single_use_token_idx').on(table.type, table.singleUseToken),
    // Tokens are found by session when it is deleted or a session-bound token is replaced; most hold null.
    index('tokens_session_id_idx').on(table.sessionId).where(sql`${table.sessionId} is not null`),
    // The same for an invitation's tokens, when its row is deleted or a new link replaces them.
    index('tokens_inactive_membership_id_idx').on(table.inactiveMembershipId).where(sql`${table.inactiveMembershipId} is not null`),
    index('tokens_followed_invitation_id_idx').on(table.followedInvitationId).where(sql`${table.followedInvitationId} is not null`),
    // One live step-up code per session: of two concurrent requests that both cleared the session's code, the later insert is refused.
    uniqueIndex('tokens_step_up_session_id_idx').on(table.sessionId).where(sql`${table.type} = 'step-up'`),
  ],
);

/** The full row, secret hashes included: only `tokens/` reads it. */
export type UnsafeTokenModel = typeof tokensTable.$inferSelect;
export type InsertTokenModel = typeof tokensTable.$inferInsert;
