import { z } from '@hono/zod-openapi';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { pagesTable } from '#/db/schema/pages';
import { paginationQuerySchema } from '#/utils/schema/common';

const pageInsertSchema = createInsertSchema(pagesTable);

export type Page = z.infer<typeof pageSelectSchema>;
const pageSelectSchema = createSelectSchema(pagesTable);

export const pagesInsertManySchema = z
  .array(
    pageInsertSchema.omit({
      modifiedAt: true,
      modifiedBy: true,
      createdAt: true,
      createdBy: true,
    }),
  )
  .min(1)
  .max(50);

export const pageUpdateSchema = pageInsertSchema
  .pick({
    slug: true,
    title: true,
    content: true,
    keywords: true,
    displayOrder: true,
    status: true,
    parentId: true,
  })
  .partial();

export const pageSchema = pageSelectSchema.openapi('Page');

const pageSortKeys = pageSelectSchema.keyof().extract(['displayOrder', 'status', 'createdAt']);

export type PageListQuery = z.infer<typeof pageListQuerySchema>;
export const pageListQuerySchema = paginationQuerySchema.extend({
  sort: pageSortKeys.default('createdAt').optional(),
});
