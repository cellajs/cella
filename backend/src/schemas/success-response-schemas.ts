import { z } from '@hono/zod-openapi';
import { mockSuccessWithRejectedItems } from '../../mocks/mock-common';

/**
 * Schema for a response with paginated data
 *
 * @param schema - The schema for the items in the paginated data. Data object has `items` and `total` properties.
 */
export const paginationSchema = <O, I>(schema: z.ZodType<O, I>) =>
  z.object({
    items: z.array(schema),
    total: z.number(),
  });

/**
 * Schema for a successful response with disallowed IDs.
 * Use for delete operations where you don't need the entities back.
 */
export const successWithRejectedItemsSchema = z
  .object({
    success: z.boolean(),
    rejectedItemIds: z.array(z.string()),
  })
  .openapi('SuccessWithRejectedItems', { example: mockSuccessWithRejectedItems() });

/** SuccessWithRejectedItems response type */
export interface SuccessWithRejectedItemsResponse {
  success: boolean;
  rejectedItemIds: string[];
}

/**
 * Factory to create a batch response schema with data items and rejected items.
 * Use for batch create operations where you need the created entities back.
 *
 * @example
 * const pagesResponseSchema = batchResponseSchema(pageSchema);
 * // Result: { data: Page[], rejectedItems: string[] }
 */
export const batchResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    rejectedItemIds: z.array(z.string()).describe('Identifiers of items that could not be processed'),
  });
