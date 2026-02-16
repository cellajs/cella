import { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import { activityActions } from '#/sync/activity-actions';
import { mockStreamNotification } from '../../mocks/mock-entity-base';
import { stxBaseSchema } from './sync-transaction-schemas';

/**
 * Stream notification schema for SSE streams.
 * Shared by both app and public streams — identical payload shape.
 * Lightweight payload - client fetches entity data via API if needed.
 * No entity data is included to keep payloads small and consistent.
 *
 * For product entities (page, attachment):
 * - Includes stx, seq, cacheToken for sync engine
 * - Client uses cacheToken to fetch entity via LRU cache
 *
 * For context entities (membership, organization) — app stream only:
 * - stx/seq/cacheToken are null/omitted
 * - Client invalidates queries to refetch
 */
export const streamNotificationSchema = z
  .object({
    action: z.enum(activityActions),
    /** Entity type for product entity events */
    entityType: z.enum(appConfig.productEntityTypes).nullable(),
    /** Resource type for non-entity events (membership) */
    resourceType: z.enum(appConfig.resourceTypes).nullable(),
    entityId: z.string(),
    organizationId: z.string().nullable(),
    /** Context entity type for membership events (organization, project, etc.) */
    contextType: z.enum(appConfig.contextEntityTypes).nullable(),
    /** Sequence number for gap detection (org-scoped for app, entityType-scoped for public) */
    seq: z.number().int().nullable(),
    /** Sync transaction metadata for conflict detection (entities only) */
    stx: stxBaseSchema.nullable(),
    /** HMAC-signed token for LRU cache access (entities only) */
    cacheToken: z.string().nullable(),
  })
  .openapi('StreamNotification', {
    description: 'Realtime notification delivered via SSE for entity and membership changes.',
    example: mockStreamNotification(),
  });

export type StreamNotification = z.infer<typeof streamNotificationSchema>;

/**
 * Base query parameters for SSE streams.
 * Offset determines where to start: 'now' for live-only, activity ID for catch-up.
 */
export const streamQuerySchema = z.object({
  offset: z.string().optional().openapi({
    description: "Starting offset: 'now' for live-only, or activity ID to receive missed notifications",
    example: 'now',
  }),
  live: z.enum(['sse', 'catchup']).optional().openapi({
    description: "Connection mode: 'sse' for streaming, 'catchup' for one-time fetch",
    example: 'sse',
  }),
  seqs: z.string().optional().openapi({
    description:
      'JSON-encoded client seqs for gap detection: {"scopeId":42}. Unchanged scopes are excluded from the response.',
    example: '{}',
  }),
});

/**
 * Query schema for public streams (SSE only, no catchup mode).
 */
export const publicStreamQuerySchema = streamQuerySchema.extend({
  live: z.enum(['sse']).optional().openapi({
    description: 'Set to "sse" for live updates (SSE stream)',
    example: 'sse',
  }),
});

/**
 * Per-scope catchup change summary.
 * Used in catchup responses to give client minimal info to sync efficiently.
 *
 * - deletedIds: exact IDs to remove from cache
 * - seq: current sequence number for product entity changes
 * - mSeq: current sequence number for membership changes (app stream only)
 *
 * Client logic:
 * - delta = serverSeq - clientSeq
 * - if delta == deletedIds.length → only deletes, no list fetch needed
 * - if delta > deletedIds.length → creates/updates happened → modifiedAfter list fetch
 * - if delta == 0 → nothing changed
 * - mSeq gap > 0 → membership changes → invalidate member queries + refresh menu
 */
export const catchupChangeSummarySchema = z.object({
  seq: z.number().int(),
  deletedIds: z.array(z.string()),
  mSeq: z.number().int().optional(),
});

export type CatchupChangeSummary = z.infer<typeof catchupChangeSummarySchema>;

/**
 * Catchup response schema for app stream.
 * Changes keyed by orgId. Client uses org context for priority routing.
 */
export const appCatchupResponseSchema = z.object({
  changes: z.record(z.string(), catchupChangeSummarySchema).openapi({
    description: 'Per-org change summary: { [orgId]: { seq, deletedIds, membership? } }',
  }),
  cursor: z.string().nullable().openapi({ description: 'Last activity ID (use as offset for next request)' }),
});

export type AppCatchupResponse = z.infer<typeof appCatchupResponseSchema>;

/**
 * Catchup response schema for public stream.
 * Changes keyed by entityType (e.g., 'page').
 */
export const publicCatchupResponseSchema = z.object({
  changes: z.record(z.string(), catchupChangeSummarySchema).openapi({
    description: 'Per-entityType change summary: { [entityType]: { seq, deletedIds } }',
  }),
  cursor: z.string().nullable().openapi({ description: 'Last activity ID (use as offset for next request)' }),
});

export type PublicCatchupResponse = z.infer<typeof publicCatchupResponseSchema>;
