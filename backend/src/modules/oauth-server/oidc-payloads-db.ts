import { index, jsonb, primaryKey, snakeCase, timestamp, varchar } from 'drizzle-orm/pg-core';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';

/**
 * The authorization server's store, one row per model instance (Grant, Session, Interaction, AuthorizationCode,
 * RefreshToken, ClientCredentials, ReplayDetection, …), as `node-oidc-provider`'s adapter contract wants it. Consent
 * grants and refresh tokens live here; "Connected apps" is a read over the Grant rows. `oidc-payloads-sweep.ts` deletes
 * what `expiresAt` says the provider no longer reads.
 */
export const oidcPayloadsTable = snakeCase.table(
  'oidc_payloads',
  {
    id: varchar({ length: maxLength.field }).notNull(),
    type: varchar({ length: 64 }).notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    grantId: varchar({ length: maxLength.field }),
    /** The consenting user, lifted from the payload so "Connected apps" and a per-user revoke are index reads. */
    accountId: varchar({ length: maxLength.field }),
    userCode: varchar({ length: maxLength.field }),
    uid: varchar({ length: maxLength.field }),
    expiresAt: timestamp({ mode: 'string' }),
    consumedAt: timestamp({ mode: 'string' }),
    createdAt: timestampColumns.createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.type, table.id] }),
    index('oidc_payloads_grant_id_idx').on(table.grantId),
    index('oidc_payloads_account_id_idx').on(table.accountId),
    index('oidc_payloads_uid_idx').on(table.uid),
    index('oidc_payloads_user_code_idx').on(table.userCode),
    index('oidc_payloads_expires_at_idx').on(table.expiresAt),
  ],
);

export type OidcPayloadModel = typeof oidcPayloadsTable.$inferSelect;
