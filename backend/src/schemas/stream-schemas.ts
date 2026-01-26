import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { activityActions } from '#/sync/activity-bus';
import { txStreamMessageSchema } from './transaction-schemas';

/**
 * Stream notification schema for notification-based sync.
 * Lightweight payload - client fetches entity data via API.
 */
export const streamNotificationSchema = z.object({
  action: z.enum(activityActions),
  entityType: z.enum(appConfig.realtimeEntityTypes),
  entityId: z.string(),
  organizationId: z.string().nullable(),
  seq: z.number().int(),
  tx: txStreamMessageSchema,
});

export type StreamNotification = z.infer<typeof streamNotificationSchema>;

/**
 * Factory to create a stream message schema (legacy, for backward compatibility).
 * Use for SSE stream message payloads that include full entity data.
 *
 * @example
 * const pageStreamMessageSchema = createStreamMessageSchema(pageSchema);
 * @deprecated Use streamNotificationSchema for notification-based sync
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
 * @deprecated Use streamNotificationSchema for notification-based sync
 */
export const streamMessageSchema = createStreamMessageSchema(z.unknown()).openapi('StreamMessage');

export type StreamMessage = z.infer<typeof streamMessageSchema>;
