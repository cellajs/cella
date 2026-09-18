import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, snakeCase, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { usersTable } from '#/modules/user/user-db';

export const supportedOAuthProviders = ['github', 'google', 'microsoft'] as const;

/** Trust class of an external identity: social OAuth today; SSO federations and LTI launches reuse the table later. */
export const identityKinds = ['oauth', 'sso', 'lti'] as const;

/**
 * External identities of a user, keyed on the provider's own subject: (provider, providerUserId, issuer). A user can hold
 * several. The address is a display snapshot of what the provider asserted last, never a key or a lookup; proven
 * inboxes live in `emails`.
 */
export const identitiesTable = snakeCase.table(
  'identities',
  {
    createdAt: timestampColumns.createdAt,
    id: uuid().primaryKey().$defaultFn(generateId),
    userId: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    kind: varchar({ enum: identityKinds }).notNull().default('oauth'),
    provider: varchar({ enum: supportedOAuthProviders }).notNull(),
    // Null for social providers; the platform issuer for identities whose subject is only unique per issuer (LTI).
    issuer: varchar({ length: maxLength.field }),
    providerUserId: varchar({ length: maxLength.field }).notNull(),
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
    uniqueIndex('identities_provider_subject_idx').on(
      table.provider,
      table.providerUserId,
      sql`coalesce(${table.issuer}, '')`,
    ),
  ],
);

export type IdentityModel = typeof identitiesTable.$inferSelect;
export type InsertIdentityModel = typeof identitiesTable.$inferInsert;
