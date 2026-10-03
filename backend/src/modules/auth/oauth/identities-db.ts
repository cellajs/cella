import { boolean, index, jsonb, snakeCase, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { maxLength } from '#/db/utils/constraints';
import type { UserId } from '#/db/utils/ids';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { connectionsTable } from '#/modules/connections/connections-db';
import { usersTable } from '#/modules/user/user-db';

export const supportedOAuthProviders = ['github', 'google', 'microsoft'] as const;

/** Trust class of an external identity: social OAuth, or an institution's SSO federation. */
export const identityKinds = ['oauth', 'sso'] as const;
export type IdentityKind = (typeof identityKinds)[number];

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
    // Always a slug, namespaced by kind: an OAuth provider for 'oauth', a federation key for 'sso'; the issuer URL lives in config.
    issuer: varchar({ length: maxLength.field }).notNull(),
    subject: varchar({ length: maxLength.field }).notNull(),
    email: varchar({ length: maxLength.field }),
    verified: boolean().notNull().default(false),
    verifiedAt: timestamp({ mode: 'string' }),
    /** The connection (an institution's trust) an sso identity came through; null for social identities. */
    connectionId: uuid().references(() => connectionsTable.id, { onDelete: 'set null' }),
    /** Claims snapshot for sso identities (affiliations, acr); nothing reads it for authorization. */
    data: jsonb().$type<Record<string, unknown>>(),
    lastUsedAt: timestamp({ mode: 'string' }),
  },
  (table) => [
    index('identities_user_id_idx').on(table.userId),
    uniqueIndex('identities_kind_issuer_subject_idx').on(table.kind, table.issuer, table.subject),
  ],
);

export type IdentityModel = typeof identitiesTable.$inferSelect;
export type InsertIdentityModel = typeof identitiesTable.$inferInsert;
