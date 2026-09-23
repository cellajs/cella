import { getTableName } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { ResourceType } from 'shared';
import { channelTables } from '#/db/channel-tables';
import { productTables } from '#/db/product-tables';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { requestsTable } from '#/modules/requests/requests-db';
import { apiKeysTable } from '#/modules/service-accounts/api-keys-db';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { usersTable } from '#/modules/user/user-db';

// Base table shape constraints for generic resolvers
export type TableWithId = AnyPgTable & { id: PgColumn };
export type TableWithIdAndSlug = TableWithId & { slug: PgColumn };
export type ResolvableTable = TableWithId | TableWithIdAndSlug;

/** Resolves a pinned map of lazy table getters, keeping each key's exact table type. */
const resolveTables = <T extends Record<string, () => AnyPgTable>>(getters: T) =>
  Object.fromEntries(Object.entries(getters).map(([type, get]) => [type, get()])) as {
    [K in keyof T]: ReturnType<T[K]>;
  };

/**
 * Entity-to-table mapping, derived from the pinned `channel-tables.ts` and `product-tables.ts`
 * lists plus `user`, the one entity that is neither. `satisfies` enforces shape without widening keys.
 */
export const entityTables = {
  user: usersTable,
  ...resolveTables(channelTables),
  ...resolveTables(productTables),
} as const satisfies Record<string, ResolvableTable>;

/** Resource-to-table mapping. */
export const resourceTables = {
  request: requestsTable,
  membership: membershipsTable,
  inactive_membership: inactiveMembershipsTable,
  tenant: tenantsTable,
  system_role: systemRolesTable,
  service_account: serviceAccountsTable,
  api_key: apiKeysTable,
  oauth_client: oauthClientsTable,
} as const satisfies Record<ResourceType, TableWithId>;

/**
 * Columns the CDC worker strips from a tracked row before it leaves the worker: `activities` stores no row data, but
 * the row image travels over `/internal/cdc` and onto the activity bus. A test asserts every tracked column whose
 * name matches `sensitiveColumnPattern` is listed here, so a new secret-bearing column fails CI until it is.
 */
export const redactedColumns = {
  api_key: ['hash'],
  oauth_client: ['secretHash'],
} as const satisfies Partial<Record<ResourceType, readonly string[]>>;

/** Column names that look like a stored secret; the redaction test compares tracked tables against this. */
export const sensitiveColumnPattern = /(hash|secret|jwk|token|password)$/i;

export type EntityType = keyof typeof entityTables;
export type EntityModel<T extends EntityType> = (typeof entityTables)[T]['$inferSelect'];

type AllTrackedTables = typeof entityTables & typeof resourceTables;
export type TrackedType = keyof AllTrackedTables;
export type TrackedModel<T extends TrackedType> = AllTrackedTables[T]['$inferSelect'];

export function getEntityTable<T extends keyof typeof entityTables>(entityType: T): (typeof entityTables)[T] {
  return entityTables[entityType];
}

// Derived table name arrays for activity/CDC
export const entityTableNames = Object.values(entityTables).map((t) => getTableName(t));
export const resourceTableNames = Object.values(resourceTables).map((t) => getTableName(t));
export const activityTableNames = [...entityTableNames, ...resourceTableNames];

/** One pg_partman conversion, applied by the partman side-effect migration. */
export interface PartitionConfig {
  name: string;
  /** Column to partition by; must be NOT NULL and part of the primary key. */
  partitionColumn: string;
  /** Partition interval (e.g., '1 week', '1 month') */
  interval: string;
  /** Retention period (e.g., '30 days', '90 days'). Null = no retention (keep indefinitely). */
  retention: string | null;
}
