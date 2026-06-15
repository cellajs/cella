import {
  type AnyPgColumn,
  doublePrecision,
  index,
  snakeCase,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { productEntityColumns } from '#/db/utils/product-entity-columns';

const pageStatusEnum = ['unpublished', 'published', 'archived'] as const;
const pageRenderModeEnum = ['default', 'overview', 'nodeOnly'] as const;

// Omit tenantId — pages are tenant-less
const { tenantId: _, ...pageProductColumns } = productEntityColumns('page');

/**
 * Pages table.
 * Parentless product entity — no organization context, no RLS.
 * Always public when published (publicAt is set). Access control is application-layer:
 * - Reads: publicGuard (no auth required)
 * - Writes: sysAdminGuard (requires system admin)
 */
export const pagesTable = snakeCase.table(
  'pages',
  {
    ...pageProductColumns,
    status: varchar({ enum: pageStatusEnum }).notNull().default('unpublished'),
    renderMode: varchar('render_mode', { enum: pageRenderModeEnum }).notNull().default('default'),
    publicAt: timestamp('public_at', { mode: 'string' }),
    parentId: uuid().references((): AnyPgColumn => pagesTable.id, {
      onDelete: 'set null',
    }),
    displayOrder: doublePrecision().notNull(),
  },
  (table) => [
    index('pages_seq_idx').on(table.seq),
    index('pages_created_by_idx').on(table.createdBy),
    index('pages_updated_by_idx').on(table.updatedBy),
    unique('pages_group_order').on(table.parentId, table.displayOrder),
  ],
);

export type PageModel = typeof pagesTable.$inferSelect;
export type InsertPageModel = typeof pagesTable.$inferInsert;
