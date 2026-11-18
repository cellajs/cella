import { index, jsonb, snakeCase, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { maxLength } from '#/db/utils/constraints';
import type { UserId } from '#/db/utils/ids';
import { isoTimestamp, timestampColumns } from '#/db/utils/timestamp-columns';
import { connectionsTable } from '#/modules/connections/connections-db';
import { usersTable } from '#/modules/user/user-db';

/** Trust class of an external identity: social OAuth, an institution's SSO federation, or an LTI platform's launch. */
const identityKinds = ['oauth', 'sso', 'lti'] as const;
export type IdentityKind = (typeof identityKinds)[number];

/**
 * External identities of a user, keyed on the provider's own subject: (kind, provider, subject). A user can hold several.
 * The address is a display snapshot of what the provider asserted last, never a key or a lookup; proven inboxes live in
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
    /**
     * Namespaced by kind: an OAuth provider slug for 'oauth' and a federation key for 'sso', whose issuer URLs live in
     * config, and the platform's issuer for 'lti', whose `sub` is unique only within it.
     */
    provider: varchar({ length: maxLength.field }).notNull(),
    subject: varchar({ length: maxLength.field }).notNull(),
    email: varchar({ length: maxLength.field }),
    /** Null until a proof stands for the identity: an inbox click, or the provider's assertion where that is the proof. */
    verifiedAt: isoTimestamp(),
    /** The connection an sso identity came through, or an lti identity launched through last; null for social identities. */
    connectionId: uuid().references(() => connectionsTable.id, { onDelete: 'set null' }),
    /** Claims snapshot for sso identities (affiliations, acr); nothing reads it for authorization. */
    data: jsonb().$type<Record<string, unknown>>(),
    lastSignInAt: isoTimestamp(),
  },
  (table) => [
    index('identities_user_id_idx').on(table.userId),
    uniqueIndex('identities_kind_provider_subject_idx').on(table.kind, table.provider, table.subject),
  ],
);

export type IdentityModel = typeof identitiesTable.$inferSelect;
export type InsertIdentityModel = typeof identitiesTable.$inferInsert;
