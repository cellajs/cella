import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { pagesTable } from '#/db/schema/pages';
import { createTxMutationSchema, createTxResponseSchema } from '#/modules/sync/schema';
import { paginationQuerySchema } from '#/utils/schema/common';
import { mockPageResponse } from '../../../mocks/mock-page';

const pageInsertSchema = createInsertSchema(pagesTable);
const pageSelectSchema = createSelectSchema(pagesTable);

export const pageSchema = pageSelectSchema
  .omit({ tx: true }) // Don't expose tx in API responses
  .openapi('Page', { example: mockPageResponse() });

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

// Tx-wrapped schemas for product entity mutations
export const pageCreateTxBodySchema = createTxMutationSchema(pageCreateBodySchema);
export const pageUpdateTxBodySchema = createTxMutationSchema(pageUpdateBodySchema);
export const pageTxResponseSchema = createTxResponseSchema(pageSchema);

const pageSortKeys = pageSelectSchema.keyof().extract(['name', 'status', 'createdAt']);

export const pageListQuerySchema = paginationQuerySchema.extend({
  sort: pageSortKeys.default('createdAt').optional(),
});
