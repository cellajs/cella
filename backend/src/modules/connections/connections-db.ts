import { boolean, index, jsonb, snakeCase, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import type { ActorId } from '#/db/utils/ids';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { actorsTable } from '#/modules/actors/actors-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';

/** The party a connection trusts: an institution behind an SSO federation, or (later) an LTI platform. */
export const connectionKinds = ['sso', 'lti'] as const;
export type ConnectionKind = (typeof connectionKinds)[number];

/** `pending` until the institution activated the service at the federation; `disabled` keeps the row but refuses sign-ins. */
export const connectionStatuses = ['pending', 'active', 'disabled'] as const;
export type ConnectionStatus = (typeof connectionStatuses)[number];

/** The protocol-specific part of a connection. */
export interface ConnectionConfig {
  /** sso: the institution's IdP entity ids, all passed as `login_hint`; one skips the federation's picker. */
  idpEntityIds?: string[];
  /** sso: the institution's logo from the federation's metadata feed, for the entry page. */
  logoUrl?: string;
}

/**
 * A tenant's trust in one external party that asserts user identities: an institution reached through an SSO
 * federation now, an LTI platform later. Its id is the public entry key of the tenant's SSO sign-in. A system
 * resource beside tenants, outside RLS: the sign-in reads it before any tenant context exists.
 */
export const connectionsTable = snakeCase.table(
  'connections',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    tenantId: varchar({ length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id, { onDelete: 'cascade' }),
    kind: varchar({ enum: connectionKinds }).notNull().default('sso'),
    /** sso: the federation key in `appConfig.federations`; lti: the platform's issuer. */
    issuer: varchar({ length: maxLength.field }).notNull(),
    /** lti: the app's client id at the platform. */
    clientId: varchar({ length: maxLength.field }),
    /** lti: the platform's deployment id. */
    deploymentId: varchar({ length: maxLength.field }),
    /** sso: the values of the federation's `tenantClaim` this institution asserts (its domains, lower case); the assertion key. */
    claimValues: varchar({ length: maxLength.field }).array().notNull().default([]),
    /** The institution's name, from the federation's metadata feed. */
    displayName: varchar({ length: maxLength.field }).notNull(),
    status: varchar({ enum: connectionStatuses }).notNull().default('pending'),
    /** sso: an active connection admits the institution's members without an invitation; off, invited addresses only. */
    jitProvisioning: boolean().notNull().default(true),
    config: jsonb().$type<ConnectionConfig>().notNull().default({}),
    createdBy: uuid()
      .references(() => actorsTable.id, { onDelete: 'set null' })
      .$type<ActorId>(),
    createdAt: timestampColumns.createdAt,
    updatedAt: timestampColumns.updatedAt,
  },
  (table) => [
    index('connections_tenant_id_idx').on(table.tenantId),
    // One connection per kind and tenant: the tenant's single organization is the target of every SSO sign-in.
    uniqueIndex('connections_tenant_id_kind_idx').on(table.tenantId, table.kind),
  ],
);

export type ConnectionModel = typeof connectionsTable.$inferSelect;
export type InsertConnectionModel = typeof connectionsTable.$inferInsert;
