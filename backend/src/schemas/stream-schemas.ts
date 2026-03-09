import { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import { activityActions } from '#/sync/activity-actions';
import { mockStreamNotification } from '../../mocks/mock-entity-base';
import { stxBaseSchema } from './sync-transaction-schemas';

/**
 * Stream notification schema for SSE streams.
 * Shared by both app and public streams — identical payload shape.
 * Lightweight payload - client fetches entity data via API if needed.
 *
 * For product entities (page, attachment):
 * - Includes stx, seqAt, cacheToken for sync engine
 *
 * For membership — app stream only:
 * - seq is null (membership changes detected via activity scan on catchup)
 * - stx/seqAt/cacheToken are null
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
    /** Per-entityType sequence number stamped by trigger (for product entity sync) */
    seqAt: z.number().int().nullable(),
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
 * Body schema for stream catchup POST requests.
 * Replaces the previous query-param approach for cleaner typed payloads.
 */
export const streamCatchupBodySchema = z.object({
  cursor: z.string().optional().openapi({
    description: 'Last activity cursor received by the client. Omit on first sync.',
    example: '0-54F6250',
  }),
  seqs: z
    .record(z.string(), z.number().int())
    .optional()
    .openapi({
      description: 'Client-side sequence numbers per scope: { "orgId:s:page": 42 }',
      example: { 'abc123:s:page': 10 },
    }),
});

/**
 * Per-scope catchup change summary.
 * Used in catchup responses to give client minimal info to sync efficiently.
 *
 * - entitySeqs: contextEntity-scoped sequence numbers from context_counters JSONB (s:{type} keys)
 *   - Source of truth for create/update detection (managed by stamp_entity_seq_at trigger)
 * - deletedIds: exact IDs to remove from cache (always scanned, watertight)
 * - deletedByType: deleted entity IDs grouped by entityType for targeted cache removal
 * - membershipChanged: true if membership activities detected in cursor range (activity scan)
 *
 * Client logic (per entityType):
 * - entityDelta = serverEntitySeq - clientEntitySeq
 * - if entityDelta > deletedForType.length → creates/updates happened → invalidate entity lists
 * - deletedIds are always applied directly (cache patching)
 * - On catchup: always invalidate membership queries (lightweight, deduplicated by React Query)
 */
export const catchupChangeSummarySchema = z.object({
  deletedIds: z.array(z.string()),
  entitySeqs: z.record(z.string(), z.number().int()).optional(),
  deletedByType: z.record(z.string(), z.array(z.string())).optional(),
  /** Per-entityType total counts from context_counters (e:{type} keys). Used for cache integrity checks. */
  entityCounts: z.record(z.string(), z.number().int()).optional(),
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
