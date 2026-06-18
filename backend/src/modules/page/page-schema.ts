import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { createUpdateSchema } from '#/core/stx';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import { pagesTable } from '#/modules/page/page-db';
import { batchResponseSchema, maxLength, paginationQuerySchema, stxBaseSchema, validUuidSchema } from '#/schemas';
import { userMinimalBaseSchema } from '#/schemas/user-minimal-base';
import { mockPageResponse } from './page-mocks';

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
  .openapi('Page', {
    description: 'A content page for documentation purposes.',
    example: mockPageResponse(),
    'x-tags': schemaTags('data', 'pages', 'cella'),
  });

const pageCreateBodySchema = pageInsertSchema
  .pick({
    name: true,
  })
  .extend({
    id: validUuidSchema,
    // Optional: client may pre-compute order for offline support. When omitted,
    // the backend assigns one (lower than current min) so the page lands at the
    // top of the list.
    displayOrder: z.number().optional(),
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

const pageSortKeys = pageSelectSchema.keyof().extract(['name', 'status', 'createdAt', 'displayOrder']);

export const pageListQuerySchema = paginationQuerySchema.extend({
  sort: pageSortKeys.default('createdAt').optional(),
});
