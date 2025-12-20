import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { pagesTable } from '#/db/schema/pages';
import { paginationQuerySchema } from '#/utils/schema/common';

const pageInsertSchema = createInsertSchema(pagesTable);
const pageSelectSchema = createSelectSchema(pagesTable);

export const pageSchema = pageSelectSchema.openapi('Page');

export const pageCreateBodySchema = pageInsertSchema.pick({
  name: true,
});

export const pageUpdateBodySchema = pageInsertSchema
  .pick({
    name: true,
    description: true,
    keywords: true,
    displayOrder: true,
    status: true,
    parentId: true,
  })
  .partial();

const pageSortKeys = pageSelectSchema.keyof().extract(['name', 'status', 'createdAt']);

export const pageListQuerySchema = paginationQuerySchema.extend({
  sort: pageSortKeys.default('createdAt').optional(),
});
