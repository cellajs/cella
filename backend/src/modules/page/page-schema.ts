import { z } from '@hono/zod-openapi';
import { pagesTable } from '#/db/schema/pages';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import { batchResponseSchema, maxLength, paginationQuerySchema, stxBaseSchema, stxRequestSchema } from '#/schemas';
import { userMinimalBaseSchema } from '#/schemas/user-minimal-base';
import { createUpdateSchema } from '#/sync';
import { mockPageResponse } from '../../../mocks/mock-page';

/** Page status enum - matches pages table status column */
export const pageStatusSchema = z.enum(['unpublished', 'published', 'archived']);

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
    modifiedBy: userMinimalBaseSchema.nullable(),
    stx: stxBaseSchema,
  })
  .openapi('Page', { description: 'A content page for documentation purposes.', example: mockPageResponse() });

export const pageCreateBodySchema = pageInsertSchema.pick({
  name: true,
});

/** Create body with stx for single page creation */
export const pageCreateStxBodySchema = pageCreateBodySchema.extend({ stx: stxRequestSchema });

/** Array schema for batch creates (1-50 pages per request), each with own stx */
export const pageCreateManyStxBodySchema = pageCreateStxBodySchema.array().min(1).max(50);

/** Update body using key/data pattern for single-field updates with conflict detection */
export const pageUpdateStxBodySchema = createUpdateSchema([
  z.literal('name'),
  z.literal('description'),
  z.literal('keywords'),
  z.literal('displayOrder'),
  z.literal('status'),
  z.literal('parentId'),
]);

// Response schemas: batch operations use { data, rejectedItems }, single returns entity directly
export const pageCreateResponseSchema = batchResponseSchema(pageSchema);

const pageSortKeys = pageSelectSchema.keyof().extract(['name', 'status', 'createdAt']);

export const pageListQuerySchema = paginationQuerySchema.extend({
  sort: pageSortKeys.default('createdAt').optional(),
  /** ISO timestamp filter for delta sync - returns pages modified at or after this time */
  modifiedAfter: z.iso.datetime().optional(),
});
