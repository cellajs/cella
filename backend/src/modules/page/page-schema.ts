import { z } from '@hono/zod-openapi';
import { pagesTable } from '#/db/schema/pages';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import { batchResponseSchema, maxLength, paginationQuerySchema, stxBaseSchema, validNanoidSchema } from '#/schemas';
import { userMinimalBaseSchema } from '#/schemas/user-minimal-base';
import { createUpdateSchema } from '#/sync';
import { mockPageResponse } from '../../../mocks/mock-page';

/** Page status enum - matches pages table status column */
const pageStatusSchema = z.enum(['unpublished', 'published', 'archived']);

/** Page render mode enum - controls how the page is displayed */
const pageRenderModeSchema = z.enum(['default', 'overview', 'nodeOnly']);

const pageInsertSchema = z.object({
  ...createInsertSchema(pagesTable, {
    description: z.string().max(maxLength.html).nullable(),
  }).shape,
  status: pageStatusSchema.default('unpublished'),
});
const pageSelectSchema = z.object({
  ...createSelectSchema(pagesTable).shape,
  status: pageStatusSchema,
});

export const pageSchema = z
  .object({
    ...pageSelectSchema.shape,
    createdBy: userMinimalBaseSchema.nullable(),
    updatedBy: userMinimalBaseSchema.nullable(),
    stx: stxBaseSchema,
  })
  .openapi('Page', { description: 'A content page for documentation purposes.', example: mockPageResponse() });

const pageCreateBodySchema = pageInsertSchema
  .pick({
    name: true,
  })
  .extend({
    id: validNanoidSchema,
  });

/** Create body with stx for single page creation */
const pageCreateStxBodySchema = pageCreateBodySchema.extend({ stx: stxBaseSchema });

/** Array schema for batch creates (1-50 pages per request), each with own stx */
export const pageCreateManyStxBodySchema = pageCreateStxBodySchema.array().min(1).max(50);

/** Update body using fields pattern for single or multi-field updates with conflict detection */
export const pageUpdateStxBodySchema = createUpdateSchema({
  name: z.string().max(maxLength.field),
  description: z.string().max(maxLength.html).nullable(),
  keywords: z.string().nullable(),
  displayOrder: z.number(),
  status: pageStatusSchema,
  renderMode: pageRenderModeSchema,
  parentId: z.string().max(maxLength.id).nullable(),
  publicAt: z.string().nullable(),
});

// Response schemas: batch operations use { data, rejectedItems }, single returns entity directly
export const pageCreateResponseSchema = batchResponseSchema(pageSchema);

const pageSortKeys = pageSelectSchema.keyof().extract(['name', 'status', 'createdAt']);

export const pageListQuerySchema = paginationQuerySchema.extend({
  sort: pageSortKeys.default('createdAt').optional(),
});
