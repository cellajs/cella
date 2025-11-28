import { z } from '@hono/zod-openapi';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { pagesTable } from '#/db/schema/pages';
import { paginationQuerySchema } from '#/utils/schema/common';

const pageInsertSchema = createInsertSchema(pagesTable);

export type Page = z.infer<typeof pageSelectSchema>;
const pageSelectSchema = createSelectSchema(pagesTable);

export const pagesCreateManySchema = z
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

// tasks require a project or workspace id
export type PageListQuery = z.infer<typeof pageListQuerySchema>;
export const pageListQuerySchema = paginationQuerySchema.extend({
  // orgIdOrSlug: z.string().optional(),
  // pageId: z.string().optional(),
  sort: z.enum(['order', 'status', 'createdAt']).default('createdAt').optional(),
  order: z.enum(['asc', 'desc']).default('asc').optional(),
  // matchMode: z.enum(['all', 'any']).default('all').optional(),
  // acceptedCutOff: z.coerce.number().positive().optional(),
});

// const something = pageListQuerySchema.extend({
//   order: pageListQuerySchema.shape.order.optional(),
// });
