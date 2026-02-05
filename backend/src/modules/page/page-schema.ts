import { z } from '@hono/zod-openapi';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { pagesTable } from '#/db/schema/pages';
import { batchResponseSchema, paginationQuerySchema, txRequestSchema } from '#/schemas';
import { txBaseSchema } from '#/schemas/tx-base-schema';
import { mockPageResponse } from '../../../mocks/mock-page';

const pageInsertSchema = createInsertSchema(pagesTable);
const pageSelectSchema = createSelectSchema(pagesTable);

export const pageSchema = z
  .object({ ...pageSelectSchema.shape, tx: txBaseSchema })
  .openapi('Page', { example: mockPageResponse() });

export const pageCreateBodySchema = pageInsertSchema.pick({
  name: true,
});

/** Create body with tx for single page creation */
export const pageCreateTxBodySchema = pageCreateBodySchema.extend({ tx: txRequestSchema });

/** Array schema for batch creates (1-50 pages per request), each with own tx */
export const pageCreateManyTxBodySchema = pageCreateTxBodySchema.array().min(1).max(50);

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

/** Update body with tx embedded */
export const pageUpdateTxBodySchema = pageUpdateBodySchema.extend({ tx: txRequestSchema });

// Response schemas: batch operations use { data, rejectedItems }, single returns entity directly
export const pageCreateResponseSchema = batchResponseSchema(pageSchema);

const pageSortKeys = pageSelectSchema.keyof().extract(['name', 'status', 'createdAt']);

export const pageListQuerySchema = paginationQuerySchema.extend({
  sort: pageSortKeys.default('createdAt').optional(),
  /** ISO timestamp filter for delta sync - returns pages modified at or after this time */
  modifiedAfter: z.string().datetime().optional(),
});
