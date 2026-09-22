import { jsonb, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { maxLength } from '#/db/utils/constraints';
import type { PrincipalId } from '#/db/utils/ids';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { principalsTable } from '#/modules/principals/principals-db';

/**
 * Pre-registered OAuth apps (a student portfolio, a partner integration): deployment-wide, installed per tenant by a
 * `service_accounts` row carrying `clientId`. MCP clients need no row: they identify themselves with a Client ID
 * Metadata Document and the user's consent is the gate. Service accounts are not rows here either; their
 * `client_credentials` client is the account itself, authenticated with its secret key.
 */
export const oauthClientsTable = snakeCase.table('oauth_clients', {
  /** The `client_id`: an opaque id for registered apps (CIMD clients use an HTTPS URL and are never stored). */
  id: varchar({ length: maxLength.field }).primaryKey(),
  name: varchar({ length: maxLength.field }).notNull(),
  /** SHA-256 of the client secret; null for public clients (PKCE only). */
  secretHash: varchar({ length: maxLength.field }),
  redirectUris: jsonb().$type<string[]>().notNull().default([]),
  logoUri: varchar({ length: maxLength.url }),
  clientUri: varchar({ length: maxLength.url }),
  policyUri: varchar({ length: maxLength.url }),
  createdBy: uuid()
    .references(() => principalsTable.id, { onDelete: 'set null' })
    .$type<PrincipalId>(),
  createdAt: timestampColumns.createdAt,
  updatedAt: timestampColumns.updatedAt,
});

export type OauthClientModel = typeof oauthClientsTable.$inferSelect;
