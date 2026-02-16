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
import { maxLength } from '#/db/utils/constraints';
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
    status: varchar({ enum: pageStatusEnum }).notNull().default('unpublished'),
    publicAccess: boolean('public_access').notNull().default(false),
    parentId: varchar({ length: maxLength.id }).references((): AnyPgColumn => pagesTable.id, {
      onDelete: 'set null',
    }),
    displayOrder: doublePrecision().notNull(),
  },
  (table) => [
    index('pages_tenant_id_idx').on(table.tenantId),
    unique('pages_group_order').on(table.parentId, table.displayOrder),
    pgPolicy('pages_select_policy', {
      for: 'select',
      using: sql`${publicAccessSelectCondition(table)}`,
    }),
    pgPolicy('pages_insert_policy', {
      for: 'insert',
      withCheck: sql`${tenantWriteCondition(table)}`,
    }),
    pgPolicy('pages_update_policy', {
      for: 'update',
      using: sql`${tenantWriteCondition(table)}`,
      withCheck: sql`${tenantWriteCondition(table)}`,
    }),
    pgPolicy('pages_delete_policy', {
      for: 'delete',
      using: sql`${tenantWriteCondition(table)}`,
    }),
  ],
);

export type PageModel = typeof pagesTable.$inferSelect;
export type InsertPageModel = typeof pagesTable.$inferInsert;
