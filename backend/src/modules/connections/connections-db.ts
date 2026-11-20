import { sql } from 'drizzle-orm';
import { boolean, check, index, jsonb, snakeCase, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { auditColumns } from '#/db/utils/audit-columns';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import type { ConnectionConfig, LtiConnectionConfig } from '#/modules/connections/connections-schema';
import { tenantsTable } from '#/modules/tenants/tenants-db';

/** The party a connection trusts: an institution behind an SSO federation, or an LTI platform that launches the app. */
export const connectionKinds = ['sso', 'lti'] as const;
export type ConnectionKind = (typeof connectionKinds)[number];

/** `pending` until the institution activated the service at the federation; `disabled` keeps the row but refuses sign-ins. */
export const connectionStatuses = ['pending', 'active', 'disabled'] as const;

/** The unique pair of an LTI connection's issuer and client id, across tenants; `pgConstraintMap` names its refusal. */
export const ltiClientIdIndex = 'connections_issuer_client_id_idx';

/**
 * A tenant's trust in one external party that asserts user identities: an institution reached through an SSO
 * federation, or an LTI platform the app registered at. An SSO connection's id is the public entry key of the
 * tenant's SSO sign-in. A system resource beside tenants, outside RLS: the sign-in reads it before any tenant context exists.
 */
export const connectionsTable = snakeCase.table(
  'connections',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    tenantId: varchar({ length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id, { onDelete: 'cascade' }),
    kind: varchar({ enum: connectionKinds }).notNull().default('sso'),
    /** The federation key in `appConfig.federations`; set on an SSO connection only. */
    federation: varchar({ length: maxLength.field }),
    /** The LTI platform's issuer; set on an LTI connection only. */
    issuer: varchar({ length: maxLength.field }),
    /** The client id the LTI platform gave the app at registration; set on an LTI connection once it registered. */
    clientId: varchar({ length: maxLength.field }),
    /** The values of the federation's `tenantClaim` this institution asserts (its domains, lower case); the assertion key. */
    claimValues: varchar({ length: maxLength.field }).array().notNull().default([]),
    /** The institution's name from the federation's metadata feed, or the LTI platform's host. */
    name: varchar({ length: maxLength.field }).notNull(),
    status: varchar({ enum: connectionStatuses }).notNull().default('pending'),
    /** An active connection admits the institution's members without an invitation; off, invited addresses only. */
    jitProvisioning: boolean().notNull().default(true),
    config: jsonb().$type<ConnectionConfig>().notNull().default({}),
    /**
     * An LTI connection's own RS256 key pair, minted at registration: the private JWK, encrypted for this row
     * (`mintConnectionKey`). Null on a connection registered before keys were made per connection.
     */
    privateJwk: text(),
    ...auditColumns(),
  },
  (table) => [
    index('connections_tenant_id_idx').on(table.tenantId),
    // One SSO connection per tenant: the tenant's single organization is the target of every SSO sign-in.
    uniqueIndex('connections_tenant_id_kind_idx').on(table.tenantId, table.kind).where(sql`${table.kind} = 'sso'`),
    // A launch finds its connection by issuer and client id, whichever tenant holds it.
    uniqueIndex(ltiClientIdIndex).on(table.issuer, table.clientId),
    // An LTI connection is stored `pending` before the platform answers its registration with a client id.
    check(
      'connections_kind_check',
      sql`(${table.kind} = 'sso' AND ${table.federation} IS NOT NULL) OR (${table.kind} = 'lti' AND ${table.issuer} IS NOT NULL AND (${table.clientId} IS NOT NULL OR ${table.status} = 'pending'))`,
    ),
  ],
);

export type ConnectionModel = typeof connectionsTable.$inferSelect;
/** A connection as an answer carries it: without its private key. */
export type ServedConnection = Omit<ConnectionModel, 'privateJwk'>;
export type InsertConnectionModel = typeof connectionsTable.$inferInsert;

/** An LTI connection as its readers type it: issuer, client id and the LTI config present. */
export type LtiConnection = ConnectionModel & { kind: 'lti'; issuer: string; clientId: string; config: LtiConnectionConfig };

/**
 * Whether a connection row is a registered LTI connection with its config (`connections_kind_check` holds the
 * columns): one still `pending` its platform's answer holds no client id.
 */
export const isLtiConnection = <T extends ServedConnection>(row: T): row is T & Pick<LtiConnection, 'kind' | 'issuer' | 'clientId' | 'config'> =>
  row.kind === 'lti' && row.issuer !== null && row.clientId !== null && row.config.jwksUri !== undefined;
