import { type AnyPgColumn, doublePrecision, pgTable, unique, varchar } from 'drizzle-orm/pg-core';
import { productEntityColumns } from '#/db/utils/product-entity-columns';

const pageStatusEnum = ['unpublished', 'published', 'archived'] as const;

/**
 * Pages table.
 */
export const pagesTable = pgTable(
  'pages',
  {
    ...productEntityColumns('page'),
    // Specific columns
    status: varchar({ enum: pageStatusEnum }).notNull().default('unpublished'),
    parentId: varchar().references((): AnyPgColumn => pagesTable.id, {
      onDelete: 'set null',
    }),
    displayOrder: doublePrecision().notNull(),
  },
  (table) => [unique('group_order').on(table.parentId, table.displayOrder)],
);

export type PageModel = typeof pagesTable.$inferSelect;
export type InsertPageModel = typeof pagesTable.$inferInsert;
