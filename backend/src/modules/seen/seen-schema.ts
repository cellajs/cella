import { z } from '@hono/zod-openapi';
import { productEntityTypeSchema, validIdSchema } from '#/schemas';

/** Batch of accumulated seen entity IDs, posted by the client every minute. */
export const seenBatchBodySchema = z.object({
  entityIds: validIdSchema.array().min(1).max(500).describe('Entity IDs the user has viewed since last batch'),
  entityType: productEntityTypeSchema.describe('Entity type for all IDs in this batch'),
});

export const seenBatchResponseSchema = z.object({
  newCount: z.number().int().min(0).describe('Number of entities newly marked as seen (deduped)'),
});

/** Shape: { [channelId]: { [productEntityType]: unseenCount } }; keys are dynamic IDs and type strings. */
export const unseenCountsResponseSchema = z.record(z.string(), z.record(z.string(), z.number().int().min(0)));
