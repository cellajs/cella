import { getTableName } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import { attachmentsTable } from '#/db/schema/attachments';
import { chatsTable } from '#/db/schema/chats';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';
import { membershipsTable } from '#/db/schema/memberships';
import { messagesTable } from '#/db/schema/messages';
import { organizationsTable } from '#/db/schema/organizations';
import { pagesTable } from '#/db/schema/pages';
import { requestsTable } from '#/db/schema/requests';
import { tenantsTable } from '#/db/schema/tenants';
import { usersTable } from '#/db/schema/users';

// Base table shape constraints for generic resolvers
export type TableWithId = AnyPgTable & { id: PgColumn };
export type TableWithIdAndSlug = TableWithId & { slug: PgColumn };
export type ResolvableTable = TableWithId | TableWithIdAndSlug;

/** Entity-to-table mapping. `satisfies` enforces shape without widening literal keys/values. */
export const entityTables = {
  user: usersTable,
  organization: organizationsTable,
  attachment: attachmentsTable,
  page: pagesTable,
  chat: chatsTable,
  message: messagesTable,
} as const satisfies Record<string, ResolvableTable>;

/** Resource types that are not entities but have activities logged. */
export const resourceTypes = ['request', 'membership', 'inactive_membership', 'tenant'] as const;

/** Resource-to-table mapping. */
export const resourceTables = {
  request: requestsTable,
  membership: membershipsTable,
  inactive_membership: inactiveMembershipsTable,
  tenant: tenantsTable,
} as const satisfies Record<string, TableWithId>;

// Derived types from the table registries above
type AllTrackedTables = typeof entityTables & typeof resourceTables;
export type TrackedType = keyof AllTrackedTables;
export type TrackedModel<T extends TrackedType> = AllTrackedTables[T]['$inferSelect'];

/** Type-safe entity table lookup by entity type key. */
export function getEntityTable<T extends keyof typeof entityTables>(entityType: T): (typeof entityTables)[T] {
  return entityTables[entityType];
}

// Derived table name arrays for activity/CDC
export const entityTableNames = Object.values(entityTables).map((t) => getTableName(t));
export const resourceTableNames = Object.values(resourceTables).map((t) => getTableName(t));
export const activityTableNames = [...entityTableNames, ...resourceTableNames];
