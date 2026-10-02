import { sql } from 'drizzle-orm';
import { index, jsonb, snakeCase, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { maxLength } from '#/db/utils/constraints';
import type { UserId } from '#/db/utils/ids';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { identitiesTable } from '#/modules/auth/oauth/identities-db';
import { authStrategiesEnum, sessionsTable } from '#/modules/auth/sessions/sessions-db';
import { connectionsTable } from '#/modules/connections/connections-db';
import { usersTable } from '#/modules/user/user-db';

const tokenTypeEnum = appConfig.tokenTypes;

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
};

/** Tokens for email verification and invitation. Rows expired for over 30 days are swept nightly by maintain_partitions(). */
export const tokensTable = snakeCase.table(
  'tokens',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    secret: varchar({ length: maxLength.field }).notNull(),
    singleUseToken: varchar({ length: maxLength.field }),
    type: varchar({ enum: tokenTypeEnum }).notNull(),
    email: varchar({ length: maxLength.field }).notNull(),
    userId: uuid()
      .references(() => usersTable.id, { onDelete: 'cascade' })
      .$type<UserId>(),
    identityId: uuid().references(() => identitiesTable.id, { onDelete: 'cascade' }),
    inactiveMembershipId: uuid(),
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
    invokedAt: timestamp({ withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('tokens_secret_type_idx').on(table.secret, table.type),
    index('tokens_user_id_idx').on(table.userId),
    index('tokens_created_by_idx').on(table.createdBy),
    index('tokens_single_use_token_idx').on(table.type, table.singleUseToken),
    // Tokens are found by session when it is deleted or a session-bound token is replaced; most hold null.
    index('tokens_session_id_idx').on(table.sessionId).where(sql`${table.sessionId} is not null`),
  ],
);

/** Includes sensitive secret field - use only in auth internals */
export type UnsafeTokenModel = typeof tokensTable.$inferSelect;
export type InsertTokenModel = typeof tokensTable.$inferInsert;

/** Safe token type with sensitive field omitted */
export type TokenModel = Omit<UnsafeTokenModel, 'secret'>;
