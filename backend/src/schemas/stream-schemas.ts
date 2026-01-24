import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { activityActions } from '#/sync/activity-bus';
import { txStreamMessageSchema } from './transaction-schemas';

/**
 * Factory to create a stream message schema.
 * Use for SSE stream message payloads.
 *
 * @example
 * const pageStreamMessageSchema = createStreamMessageSchema(pageSchema);
 */
export const createStreamMessageSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema.nullable(),
    entityType: z.enum(appConfig.realtimeEntityTypes),
    entityId: z.string(),
    action: z.enum(activityActions),
    activityId: z.string(),
    changedKeys: z.array(z.string()).nullable(),
    createdAt: z.string(),
    tx: txStreamMessageSchema.nullable(),
  });

/**
 * Base stream message schema (entity data as unknown).
 * Use when specific entity type is not known at compile time.
 */
export const streamMessageSchema = createStreamMessageSchema(z.unknown()).openapi('StreamMessage');

export type StreamMessage = z.infer<typeof streamMessageSchema>;
