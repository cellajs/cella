import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { activityActions } from '#/sync/activity-bus';
import { mockPublicStreamActivity, mockStreamNotification } from '../../mocks/mock-entity-base';
import { txStreamMessageSchema } from './transaction-schemas';

/**
 * Stream notification schema for SSE streams.
 * Lightweight payload - client fetches entity data via API if needed.
 * No entity data is included to keep payloads small and consistent.
 *
 * For product entities (page, attachment):
 * - Includes tx, seq, cacheToken for sync engine
 * - Client uses cacheToken to fetch entity via LRU cache
 *
 * For context entities (membership, organization):
 * - tx/seq/cacheToken are null/omitted
 * - Client invalidates queries to refetch
 */
export const streamNotificationSchema = z
  .object({
    action: z.enum(activityActions),
    /** Entity type for realtime entity events */
    entityType: z.enum(appConfig.realtimeEntityTypes).nullable(),
    /** Resource type for non-entity events (membership) */
    resourceType: z.enum(appConfig.resourceTypes).nullable(),
    entityId: z.string(),
    organizationId: z.string().nullable(),
    /** Context entity type for membership events (organization, project, etc.) */
    contextType: z.enum(appConfig.contextEntityTypes).nullable(),
    /** Sequence number for gap detection (entities only) */
    seq: z.number().int().nullable(),
    /** Transaction metadata for conflict detection (entities only) */
    tx: txStreamMessageSchema.nullable(),
    /** HMAC-signed token for LRU cache access (entities only) */
    cacheToken: z.string().nullable(),
  })
  .openapi('StreamNotification', { example: mockStreamNotification() });

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
  .openapi('PublicStreamActivity', { example: mockPublicStreamActivity() });

export type PublicStreamActivity = z.infer<typeof publicStreamActivitySchema>;

/**
 * Base query parameters for SSE streams.
 * Offset determines where to start: 'now' for live-only, activity ID for catch-up.
 */
export const streamQuerySchema = z.object({
  offset: z.string().optional().openapi({
    description: "Starting offset: 'now' for live-only, or activity ID to receive missed notifications",
    example: 'now',
  }),
  live: z.enum(['sse', 'poll']).optional().openapi({
    description: "Connection mode: 'sse' for streaming, 'poll' for one-time fetch",
    example: 'sse',
  }),
});

/**
 * Query schema for public streams (SSE only, no poll mode).
 */
export const publicStreamQuerySchema = streamQuerySchema.extend({
  live: z.enum(['sse']).optional().openapi({
    description: 'Set to "sse" for live updates (SSE stream)',
    example: 'sse',
  }),
});

/**
 * Generic stream response schema factory.
 * Returns activities array with cursor for pagination.
 */
export const streamResponseSchema = <T extends z.ZodTypeAny>(activitySchema: T) =>
  z.object({
    activities: z.array(activitySchema),
    cursor: z.string().nullable().openapi({ description: 'Last activity ID (use as offset for next request)' }),
  });

/** App stream response (for authenticated user streams) */
export const appStreamResponseSchema = streamResponseSchema(streamNotificationSchema);
export type AppStreamResponse = z.infer<typeof appStreamResponseSchema>;

/** Public stream response (for unauthenticated entity streams) */
export const publicStreamResponseSchema = streamResponseSchema(publicStreamActivitySchema);
export type PublicStreamResponse = z.infer<typeof publicStreamResponseSchema>;
