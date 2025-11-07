import { z } from '@hono/zod-openapi';

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
 */
export const successWithRejectedItemsSchema = z.object({
  success: z.boolean(),
  rejectedItems: z.array(z.string()),
});
