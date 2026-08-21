import { getTableName } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { ResourceType } from 'shared';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { requestsTable } from '#/modules/requests/requests-db';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { usersTable } from '#/modules/user/user-db';

// Base table shape constraints for generic resolvers
export type TableWithId = AnyPgTable & { id: PgColumn };
export type TableWithIdAndSlug = TableWithId & { slug: PgColumn };
export type ResolvableTable = TableWithId | TableWithIdAndSlug;

/** Entity-to-table mapping. `satisfies` enforces shape without widening literal keys/values. */
export const entityTables = {
  user: usersTable,
  organization: organizationsTable,
  attachment: attachmentsTable,
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

/** App partition entry: the Drizzle table stands in for `name`, so the parity test checks the same schema the migration converts. */
export type AppPartitionConfig = Omit<PartitionConfig, 'name'> & { table: AnyPgTable };

/** App tables to convert to pg_partman partitions; merged after cella's own entries in the partman migration. */
export const appPartitionConfigs: AppPartitionConfig[] = [];

/** App tables outside RLS that runtime_role may read and write (application-layer guards), merged into the RLS migration grants. */
export const appFullCrudTables: string[] = [];

/** App tables outside RLS that runtime_role may only read, merged into the RLS migration grants. */
export const appReadOnlyTables: string[] = [];
