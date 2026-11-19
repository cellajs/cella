import { sql } from 'drizzle-orm';
import { check, jsonb, snakeCase, varchar } from 'drizzle-orm/pg-core';
import type { AccessScope } from 'shared';
import { auditColumns } from '#/db/utils/audit-columns';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import type { LtiToolConfig } from '#/modules/lti-platform/lti-platform-schema';
import { tenantsTable } from '#/modules/tenants/tenants-db';

/**
 * Pre-registered OAuth apps (a student portfolio, a partner integration): deployment-wide, installed per tenant by a
 * `service_accounts` row carrying its id in `oauthClientId`; no route writes that installation row yet. MCP clients
 * need no row: they identify themselves with a Client ID Metadata Document and the user's consent is the gate. Service
 * accounts are not rows here either; their `client_credentials` client is the account itself, authenticated with its
 * secret key.
 *
 * An LTI tool's registration is a row too, the one kind with `ltiToolConfig` set. The grant policy never reads it, and
 * the provider reads it only at the token endpoint, as the `client_credentials` client of an approved installation.
 */
export const oauthClientsTable = snakeCase.table(
  'oauth_clients',
  {
    /** The `client_id`: an opaque id for registered apps (CIMD clients use an HTTPS URL and are never stored). */
    id: varchar({ length: maxLength.field }).primaryKey(),
    name: varchar({ length: maxLength.field }).notNull(),
    /** SHA-256 of the client secret; null for public clients (PKCE only). */
    secretHash: varchar({ length: maxLength.field }),
    redirectUris: jsonb().$type<string[]>().notNull().default([]),
    logoUri: varchar({ length: maxLength.url }),
    /** The tenant an LTI registration is private to, gone with it; null for every other client. */
    tenantId: varchar({ length: tenantIdLength }).references(() => tenantsTable.id, { onDelete: 'cascade' }),
    /** The LTI tool's key set: the platform reads it to check the assertions an installation's token requests are signed with. */
    jwksUri: varchar({ length: maxLength.url }),
    /** Where an LTI launch starts: the LTI tool's login initiation address. */
    initiateLoginUri: varchar({ length: maxLength.url }),
    /** The LTI tool's configuration as the platform recorded it, its launch addresses included. */
    ltiToolConfig: jsonb().$type<LtiToolConfig>(),
    /** The access scopes an LTI tool asked for in its registration, of those the platform knows: the most an admin grants. */
    requestedScopes: jsonb().$type<AccessScope[]>(),
    ...auditColumns(),
  },
  (table) => [
    // An LTI registration holds every address a launch needs, and no other client holds LTI addresses.
    check(
      'oauth_clients_lti_check',
      sql`(${table.ltiToolConfig} IS NULL) = (${table.initiateLoginUri} IS NULL) AND (${table.ltiToolConfig} IS NULL OR ${table.jwksUri} IS NOT NULL)`,
    ),
  ],
);
