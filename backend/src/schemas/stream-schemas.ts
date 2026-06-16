import { z } from '@hono/zod-openapi';
import { activityActions, appConfig } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { mockStreamNotification } from './stream-mocks';
import { stxBaseSchema } from './sync-transaction-schemas';

/** Reusable schema for embedded entity propagation hints */
const propagationHintSchema = z.object({
  sourceType: z.string().describe('Entity type that triggered the propagation (e.g. label)'),
  targetType: z.string().describe('Entity type whose cache should be invalidated (e.g. task)'),
  field: z.string().describe('Field on the target entity that references the source (e.g. labels)'),
  update: z.array(z.string()).describe('Target entity IDs that need cache refresh'),
  remove: z.array(z.string()).describe('Target entity IDs that need the source reference removed'),
});

/**
 * Stream notification schema for SSE streams.
 * Shared by both app and public streams — identical payload shape.
 * Lightweight payload - client fetches entity data via API if needed.
 *
 * For product entities (page, attachment):
 * - Includes stx, seq, cacheToken for sync engine
 *
 * For membership — app stream only:
 * - seq is null (membership changes detected via activity scan on catchup)
 * - stx/seq/cacheToken are null
 */
export const streamNotificationSchema = z
  .object({
    action: z.enum(activityActions),
    entityType: z.enum(appConfig.productEntityTypes).nullable(),
    resourceType: z.enum(appConfig.resourceTypes).nullable(),
    subjectId: z.string().nullable(),
    organizationId: z.string().nullable(),
    tenantId: z.string().nullable(),
    contextType: z
      .enum(appConfig.contextEntityTypes)
      .nullable()
      .describe('Context entity type for membership events (e.g. organization, project)'),
    seq: z.number().int().nullable().describe('Per-entityType sequence number used for gap detection in sync'),
    contextId: z
      .string()
      .nullable()
      .describe('Context entity ID for grouping (e.g. projectId for tasks in unseen counts)'),
    stx: stxBaseSchema.nullable().describe('Sync transaction metadata for HLC conflict resolution'),
    cacheToken: z.string().nullable().describe('HMAC-signed token for single-entity LRU cache access'),
    batchUntilSeq: z
      .number()
      .int()
      .nullable()
      .describe('Last seq for a batched notification — client should fetch range'),
    deletedIds: z.array(z.string()).nullable().describe('Entity IDs in a delete batch'),
    propagation: propagationHintSchema
      .nullable()
      .describe('Embedded entity propagation hint for cross-entity cache invalidation'),
  })
  .openapi('StreamNotification', {
    description: 'Realtime notification delivered via SSE for entity and membership changes.',
    example: mockStreamNotification(),
    'x-tags': schemaTags('data', 'entities', 'cella'),
  });

export type StreamNotification = z.infer<typeof streamNotificationSchema>;

/**
 * Body schema for stream catchup POST requests.
 * Replaces the previous query-param approach for cleaner typed payloads.
 */
export const streamCatchupBodySchema = z.object({
  cursor: z.string().optional().openapi({
    description: 'Last activity cursor received by the client (LSN-based). Omit on first sync.',
    example: '0-16B3748',
  }),
  seqs: z
    .record(z.string(), z.number().int())
    .optional()
    .openapi({
      description: 'Client-side sequence numbers per scope: { "organizationId:s:page": 42 }',
      example: { 'abc123:s:page': 10 },
    }),
});

/** Per-child-context change summary for sub-context seq drill-down. */
const childContextChangeSummarySchema = z.object({
  entitySeqs: z.record(z.string(), z.number().int()).optional(),
  entityCounts: z.record(z.string(), z.number().int()).optional(),
});

/**
 * Per-scope catchup change summary.
 * Used in catchup responses to give client minimal info to sync efficiently.
 *
 * Dual-level design:
 * - entitySeqs (org-level): quick screening — "did anything change for this entity type in this org?"
 * - childContextChanges: precision drill-down — per-child-context entitySeqs for delta fetch
 *
 * - deletedByType: deleted entity IDs grouped by entityType for targeted cache removal (watertight via activities scan)
 *
 * Client logic:
 * 1. Compare org-level entitySeqs for quick skip (unchanged → skip entirely)
 * 2. For changed orgs, iterate childContextChanges to find which child contexts changed
 * 3. Delta fetch only for changed (childContext, entityType) pairs
 * - deletedByType entries are always applied directly (cache patching)
 * - On catchup: always invalidate membership queries (lightweight, deduplicated by React Query)
 */
export const catchupChangeSummarySchema = z.object({
  deletedByType: z.record(z.string(), z.array(z.string())),
  /**
   * Entity types whose deletes exceeded the server enumeration cap. The client should
   * invalidate the whole list for these types (one refetch) instead of removing entities
   * one id at a time. Deletes for these types are NOT present in `deletedByType`.
   */
  deleteOverflow: z.array(z.string()).optional(),
  /** Org-level entity seqs (change signal for quick screening). Managed by CDC worker. */
  entitySeqs: z.record(z.string(), z.number().int()).optional(),
  /** Org-level per-entityType total counts from context_counters (e:{type} keys). Used for cache integrity checks. */
  entityCounts: z.record(z.string(), z.number().int()).optional(),
  /** Per-child-context entity seqs and counts for sub-context delta fetch precision. */
  childContextChanges: z.record(z.string(), childContextChangeSummarySchema).optional(),
  /** Embedded entity propagation hints (source entity changes that require target cache patching) */
  propagation: z.array(propagationHintSchema).optional(),
});

export type CatchupChangeSummary = z.infer<typeof catchupChangeSummarySchema>;

/**
 * Catchup response schema for app stream.
 * Changes keyed by organizationId. Client uses org context for priority routing.
 */
export const appCatchupResponseSchema = z.object({
  changes: z.record(z.string(), catchupChangeSummarySchema).openapi({
    description: 'Per-org change summary: { [organizationId]: { deletedByType, entitySeqs?, entityCounts? } }',
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
    description: 'Per-entityType change summary: { [entityType]: { deletedByType, entitySeqs? } }',
  }),
  cursor: z.string().nullable().openapi({ description: 'Last activity ID (use as offset for next request)' }),
});

export type PublicCatchupResponse = z.infer<typeof publicCatchupResponseSchema>;
