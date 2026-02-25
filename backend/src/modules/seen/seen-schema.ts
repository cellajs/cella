import { z } from '@hono/zod-openapi';
import { productEntityTypeSchema } from '#/schemas';

/**
 * Request body for batch marking entities as seen.
 * Posted every 1 minute from the client with accumulated seen entity IDs.
 */
export const seenBatchBodySchema = z.object({
  entityIds: z.array(z.string().max(50)).min(1).max(500).describe('Entity IDs the user has viewed since last batch'),
  entityType: productEntityTypeSchema.describe('Entity type for all IDs in this batch'),
});

/**
 * Response for batch seen POST — returns the number of newly recorded views.
 */
export const seenBatchResponseSchema = z.object({
  newCount: z.number().int().min(0).describe('Number of entities newly marked as seen (deduped)'),
});

/**
 * Response for GET /unseen/counts.
 * Shape: { [contextEntityId]: { [productEntityType]: unseenCount } }
 * Entity-agnostic — keys are dynamic IDs and type strings, not hardcoded field names.
 */
export const unseenCountsResponseSchema = z.record(z.string(), z.record(z.string(), z.number().int().min(0)));
