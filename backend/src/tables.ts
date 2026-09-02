import { getTableName } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { ResourceType } from 'shared';
import { channelTables } from '#/db/channel-tables';
import { productTables } from '#/db/product-tables';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { requestsTable } from '#/modules/requests/requests-db';
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
} as const satisfies Record<ResourceType, TableWithId>;

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
