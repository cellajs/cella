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
