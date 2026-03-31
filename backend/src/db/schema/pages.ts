import { type AnyPgColumn, doublePrecision, index, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { maxLength } from '#/db/utils/constraints';
import { productEntityColumns } from '#/db/utils/product-entity-columns';

const pageStatusEnum = ['unpublished', 'published', 'archived'] as const;
const pageRenderModeEnum = ['default', 'overview', 'nodeOnly'] as const;

/**
 * Pages table.
 * Parentless product entity — no organization context, no RLS.
 * Always public when published (publicAt is set). Access control is application-layer:
 * - Reads: publicGuard (no auth required)
 * - Writes: sysAdminGuard (requires system admin)
 */
export const pagesTable = pgTable(
  'pages',
  {
    ...productEntityColumns('page'),
    status: varchar({ enum: pageStatusEnum }).notNull().default('unpublished'),
    renderMode: varchar('render_mode', { enum: pageRenderModeEnum }).notNull().default('default'),
    publicAt: timestamp('public_at', { mode: 'string' }),
    parentId: varchar({ length: maxLength.id }).references((): AnyPgColumn => pagesTable.id, {
      onDelete: 'set null',
    }),
    displayOrder: doublePrecision().notNull(),
  },
  (table) => [
    index('pages_tenant_id_idx').on(table.tenantId),
    index('pages_seq_idx').on(table.seq),
    unique('pages_group_order').on(table.parentId, table.displayOrder),
  ],
);

export type PageModel = typeof pagesTable.$inferSelect;
export type InsertPageModel = typeof pagesTable.$inferInsert;
