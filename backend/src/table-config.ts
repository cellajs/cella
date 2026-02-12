import { getTableName } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';

import { attachmentsTable } from '#/db/schema/attachments';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { pagesTable } from '#/db/schema/pages';
import { requestsTable } from '#/db/schema/requests';
import { usersTable } from '#/db/schema/users';

/**
 * Minimal structural constraints needed for generic resolvers:
 * - every entity/resource we resolve must have an `id` column
 * - some tables also have a `slug` column
 */
export type TableWithId = AnyPgTable & { id: PgColumn<any> };
export type TableWithIdAndSlug = TableWithId & { slug: PgColumn<any> };
export type ResolvableTable = TableWithId | TableWithIdAndSlug;

export function hasSlug(table: ResolvableTable): table is TableWithIdAndSlug {
  return 'slug' in table;
}

/**
 * Define a mapping of entities and their tables.
 *
 * `satisfies` enforces our table shape without widening the literal keys/values.
 */
export const entityTables = {
  user: usersTable,
  organization: organizationsTable,
  attachment: attachmentsTable,
  page: pagesTable,
} as const satisfies Record<string, ResolvableTable>;

/**
 * Define a mapping of resources and their tables.
 */
export const resourceTables = {
  request: requestsTable,
  membership: membershipsTable,
  inactive_membership: inactiveMembershipsTable,
} as const satisfies Record<string, TableWithId>;

/** Combined type of all tracked tables (entities + resources) */
type AllTrackedTables = typeof entityTables & typeof resourceTables;

/** All tracked type names (entity types + resource types) */
export type TrackedType = keyof AllTrackedTables;

/** Infer the model type from a tracked type name */
export type TrackedModel<T extends TrackedType> = AllTrackedTables[T]['$inferSelect'];

/** Table names derived from entity tables */
export const entityTableNames = Object.values(entityTables).map((t) => getTableName(t));
