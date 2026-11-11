import { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import { validIdSchema } from '#/schemas';

/** Batch of accumulated seen product IDs, posted by the client's seen store on a timer and on page unload. */
export const seenBatchBodySchema = z.object({
  productIds: validIdSchema.array().min(1).max(500).describe('Product IDs the user has viewed since last batch'),
  productType: z.enum(appConfig.seenTrackedProductTypes).describe('Product type for all IDs in this batch'),
});

export const seenBatchResponseSchema = z.object({ newCount: z.number().int().min(0).describe('Number of entities newly marked as seen (deduped)') });

/** Shape: { [channelId]: { [productEntityType]: unseenCount } }; keys are dynamic IDs and type strings. */
export const unseenCountsResponseSchema = z.record(z.string(), z.record(z.string(), z.number().int().min(0)));
