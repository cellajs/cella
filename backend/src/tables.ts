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

type TableWithId = AnyPgTable & { id: PgColumn };
export type TableWithIdAndSlug = TableWithId & { slug: PgColumn };
/** A table the entity resolvers read by id, or by slug when it has one. */
export type ResolvableTable = TableWithId | TableWithIdAndSlug;

/** Resolves a pinned map of lazy table getters, keeping each key's exact table type. */
function resolveTables<T extends Record<string, () => AnyPgTable>>(getters: T) {
  return Object.fromEntries(Object.entries(getters).map(([type, get]) => [type, get()])) as { [K in keyof T]: ReturnType<T[K]> };
}

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

export type EntityModel<T extends keyof typeof entityTables> = (typeof entityTables)[T]['$inferSelect'];

type AllTrackedTables = typeof entityTables & typeof resourceTables;
export type TrackedType = keyof AllTrackedTables;
export type TrackedModel<T extends TrackedType> = AllTrackedTables[T]['$inferSelect'];

/** The table of an entity type, typed to that type's own table. */
export function getEntityTable<T extends keyof typeof entityTables>(entityType: T): (typeof entityTables)[T] {
  return entityTables[entityType];
}

/** One table converted to native range partitions by the retention side-effect migration; `apply_retention()` drops what is past its retention. */
export interface PartitionConfig {
  name: string;
  /** Column to partition by; must be NOT NULL and part of the primary key. */
  partitionColumn: string;
  /** Partition interval (e.g., '1 week', '1 month') */
  interval: string;
  /** Retention period (e.g., '30 days', '90 days'). Null = no retention (keep indefinitely). */
  retention: string | null;
}

/**
 * App partition entry (`appPartitionConfigs` in product-tables.ts): the Drizzle table stands in for `name`, so the
 * parity test checks the same schema the migration converts.
 */
export type AppPartitionConfig = Omit<PartitionConfig, 'name'> & { table: AnyPgTable };
