import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { pagesTable } from '#/db/schema/pages';
import { batchResponseSchema, createTxMutationSchema, paginationQuerySchema } from '#/schemas';
import { mockPageResponse } from '../../../mocks/mock-page';

const pageInsertSchema = createInsertSchema(pagesTable);
const pageSelectSchema = createSelectSchema(pagesTable);

export const pageSchema = pageSelectSchema.openapi('Page', { example: mockPageResponse() });

export const pageCreateBodySchema = pageInsertSchema.pick({
  name: true,
});

/** Array schema for batch creates (1-50 pages per request) */
const pageCreateManySchema = pageCreateBodySchema.array().min(1).max(50);

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

// Tx-wrapped schemas for product entity mutations (request only)
export const pageCreateTxBodySchema = createTxMutationSchema(pageCreateManySchema);
export const pageUpdateTxBodySchema = createTxMutationSchema(pageUpdateBodySchema);

// Response schemas: batch operations use { data, rejectedItems }, single returns entity directly
export const pageCreateResponseSchema = batchResponseSchema(pageSchema);

const pageSortKeys = pageSelectSchema.keyof().extract(['name', 'status', 'createdAt']);

export const pageListQuerySchema = paginationQuerySchema.extend({
  sort: pageSortKeys.default('createdAt').optional(),
});
