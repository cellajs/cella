import { boolean, index, jsonb, snakeCase, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { maxLength } from '#/db/utils/constraints';
import type { UserId } from '#/db/utils/ids';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { usersTable } from '#/modules/user/user-db';

export const supportedOAuthProviders = ['github', 'google', 'microsoft'] as const;

/** Trust class of an external identity: social OAuth today; SSO federations and LTI launches reuse the table later. */
export const identityKinds = ['oauth', 'sso', 'lti'] as const;

/**
 * External identities of a user, keyed on the issuer's own subject: (kind, issuer, subject). A user can hold several.
 * The address is a display snapshot of what the issuer asserted last, never a key or a lookup; proven inboxes live in
 * `emails`.
 */
export const identitiesTable = snakeCase.table(
  'identities',
  {
    createdAt: timestampColumns.createdAt,
    id: uuid().primaryKey().$defaultFn(generateId),
    userId: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' })
      .$type<UserId>(),
    kind: varchar({ enum: identityKinds }).notNull().default('oauth'),
    // Always a slug, namespaced by kind: a supported OAuth provider for 'oauth'; its issuer URL lives in config, not here.
    issuer: varchar({ length: maxLength.field }).notNull(),
    subject: varchar({ length: maxLength.field }).notNull(),
    email: varchar({ length: maxLength.field }),
    verified: boolean().notNull().default(false),
    verifiedAt: timestamp({ mode: 'string' }),
    // Later: the sso_connections row this identity came through.
    connectionId: varchar({ length: maxLength.field }),
    // Claims snapshot for non-social kinds (affiliations, acr, LTI context); nothing reads it yet.
    data: jsonb(),
    lastUsedAt: timestamp({ mode: 'string' }),
  },
  (table) => [
    index('identities_user_id_idx').on(table.userId),
    uniqueIndex('identities_kind_issuer_subject_idx').on(table.kind, table.issuer, table.subject),
  ],
);

export type IdentityModel = typeof identitiesTable.$inferSelect;
export type InsertIdentityModel = typeof identitiesTable.$inferInsert;
