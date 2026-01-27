import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { activityActions } from '#/sync/activity-bus';
import { txStreamMessageSchema } from './transaction-schemas';

/**
 * Stream notification schema for notification-based sync.
 * Lightweight payload - client fetches entity data via API.
 *
 * cacheToken: HMAC-signed token that grants access to the LRU entity cache.
 * The first client to fetch with this token populates the cache; subsequent
 * clients get a cache hit without hitting the database.
 */
export const streamNotificationSchema = z
  .object({
    action: z.enum(activityActions),
    entityType: z.enum(appConfig.realtimeEntityTypes),
    entityId: z.string(),
    organizationId: z.string().nullable(),
    seq: z.number().int(),
    tx: txStreamMessageSchema,
    /** HMAC-signed token for LRU cache access. Clients should pass this in X-Cache-Token header. */
    cacheToken: z.string().optional(),
  })
  .openapi('StreamNotification');

export type StreamNotification = z.infer<typeof streamNotificationSchema>;

/**
 * Schema for public stream activity items.
 * Used for catch-up responses in public SSE streams.
 */
export const publicStreamActivitySchema = z
  .object({
    activityId: z.string(),
    action: z.enum(activityActions),
    entityType: z.enum(appConfig.realtimeEntityTypes),
    entityId: z.string(),
    changedKeys: z.array(z.string()).nullable(),
    createdAt: z.string(),
  })
  .openapi('PublicStreamActivity');

export type PublicStreamActivity = z.infer<typeof publicStreamActivitySchema>;
