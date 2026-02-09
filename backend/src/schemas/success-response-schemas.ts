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
 * Factory to create a batch response schema for create/update/delete operations.
 * Provides a unified response format with optional data items and rejected items.
 *
 * - For creates/updates: pass item schema to get `data: T[]` with created/updated items
 * - For deletes: omit item schema to get `data: []` (empty array)
 *
 * @example
 * // For create operations - returns created items
 * const pagesResponseSchema = batchResponseSchema(pageSchema);
 * // Result: { data: Page[], rejectedItemIds: string[], rejectionReasons?: Record<string, string> }
 *
 * @example
 * // For delete operations - returns empty data
 * const deleteResponseSchema = batchResponseSchema();
 * // Result: { data: [], rejectedItemIds: string[], rejectionReasons?: Record<string, string> }
 */
export const batchResponseSchema = <T extends z.ZodTypeAny>(itemSchema?: T) =>
  z.object({
    data: itemSchema ? z.array(itemSchema) : z.tuple([]).rest(z.never()),
    rejectedItemIds: z.array(z.string()).describe('Identifiers of items that could not be processed'),
    rejectionReasons: z.record(z.string(), z.string()).optional().describe('Map of rejected item ID to reason code'),
  });

/** BatchResponse type for delete operations (no data items) */
export interface BatchResponseEmpty {
  data: [];
  rejectedItemIds: string[];
  // TODO-031 instead of a id to reason, we can have a reason and an array of ids. lets also enforce translation key type here?
  rejectionReasons?: Record<string, string>;
}
