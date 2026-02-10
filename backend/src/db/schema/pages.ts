import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  doublePrecision,
  index,
  pgPolicy,
  pgTable,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';
import { publicAccessSelectCondition, tenantWriteCondition } from '#/db/rls-helpers';
import { tenantsTable } from '#/db/schema/tenants';
import { productEntityColumns } from '#/db/utils/product-entity-columns';

const pageStatusEnum = ['unpublished', 'published', 'archived'] as const;

/**
 * Pages table.
 * Tenant-scoped with public access support. Pages with publicAccess=true are readable
 * by unauthenticated users. Write operations require authentication (sysAdminGuard at app layer).
 * Each page belongs to a tenant only (no organization context).
 */
export const pagesTable = pgTable(
  'pages',
  {
    ...productEntityColumns('page'),
    // Tenant isolation
    tenantId: varchar('tenant_id', { length: 24 })
      .notNull()
      .references(() => tenantsTable.id),
    // Specific columns
    // TODO should we consider restricting all varchars to a certain length for better perf? e.g. name: varchar(255)
    status: varchar({ enum: pageStatusEnum }).notNull().default('unpublished'),
    publicAccess: boolean('public_access').notNull().default(false),
    parentId: varchar().references((): AnyPgColumn => pagesTable.id, {
      onDelete: 'set null',
    }),
    displayOrder: doublePrecision().notNull(),
  },
  (table) => [
    index('pages_tenant_id_idx').on(table.tenantId),
    unique('pages_group_order').on(table.parentId, table.displayOrder),

    // RLS Policies: Public access for SELECT, authenticated for writes
    // SELECT: Tenant match + (authenticated OR publicAccess=true)
    pgPolicy('pages_select_policy', {
      for: 'select',
      using: sql`${publicAccessSelectCondition(table)}`,
    }),
    // INSERT: Requires authenticated + tenant (sysAdminGuard handles admin check at app layer)
    pgPolicy('pages_insert_policy', {
      for: 'insert',
      withCheck: sql`${tenantWriteCondition(table)}`,
    }),
    // UPDATE: Requires authenticated + tenant
    pgPolicy('pages_update_policy', {
      for: 'update',
      using: sql`${tenantWriteCondition(table)}`,
      withCheck: sql`${tenantWriteCondition(table)}`,
    }),
    // DELETE: Requires authenticated + tenant
    pgPolicy('pages_delete_policy', {
      for: 'delete',
      using: sql`${tenantWriteCondition(table)}`,
    }),
  ],
);

export type PageModel = typeof pagesTable.$inferSelect;
export type InsertPageModel = typeof pagesTable.$inferInsert;
