import { z } from '@hono/zod-openapi';
import { productEntityTypeSchema } from '#/schemas';

/**
 * Request body for batch marking entities as seen.
 * Posted every 10 minutes from the client with accumulated seen entity IDs.
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
 * Single unseen count entry per org per entity type.
 */
export const unseenCountSchema = z.object({
  organizationId: z.string(),
  entityType: productEntityTypeSchema,
  unseenCount: z.number().int().min(0),
});

/**
 * Response for GET /me/unseen-counts.
 */
export const unseenCountsResponseSchema = z.object({
  counts: z.array(unseenCountSchema),
});
