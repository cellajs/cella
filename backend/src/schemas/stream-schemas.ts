import { z } from '@hono/zod-openapi';
import { activityActions, appConfig } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { mockStreamNotification } from './stream-mocks';
import { stxBaseSchema } from './sync-transaction-schemas';

/** Reusable schema for embedded-product propagation hints */
const propagationHintSchema = z.object({
  embeddedProduct: z
    .enum(appConfig.productEntityTypes)
    .describe('Product type whose change triggered the propagation (e.g. label)'),
  hostProduct: z
    .enum(appConfig.productEntityTypes)
    .describe('Host product type whose cache should be patched (e.g. task)'),
  hostColumn: z.string().describe('Column on the host product that embeds the changed product (e.g. labels)'),
  update: z.array(z.string()).describe('Host product IDs that need cache refresh'),
  remove: z.array(z.string()).describe('Host product IDs that need the embedded reference removed'),
});

/**
 * Lightweight app-stream notification schema; clients fetch entity data separately.
 * Product events carry sync metadata, while membership events leave sequence and STX null.
 */
export const streamNotificationSchema = z
  .object({
    kind: z
      .enum(['product', 'membership'])
      .describe('Discriminant for the notification: product-entity sync vs membership change'),
    action: z
      .enum([...activityActions, 'moveOut'] as const)
      .describe('Change kind; moveOut = the row left this path (reparent) and is no longer readable there'),
    productType: z.enum(appConfig.productEntityTypes).nullable(),
    resourceType: z.enum(appConfig.resourceTypes).nullable(),
    subjectId: z.string().nullable(),
    organizationId: z.string().nullable(),
    tenantId: z.string().nullable(),
    channelType: z
      .enum(appConfig.channelEntityTypes)
      .nullable()
      .describe('Channel entity type for membership events (e.g. organization, project)'),
    path: z
      .string()
      .nullable()
      .describe('Materialized id-path of the affected rows (root-first ancestor ids); moveOut carries the OLD path'),
    seq: z
      .number()
      .int()
      .nullable()
      .describe('Org-sequence position (one order per organization, shared across product entity types)'),
    channelId: z
      .string()
      .nullable()
      .describe('Channel entity ID for grouping (e.g. projectId for tasks in unseen counts)'),
    stx: stxBaseSchema.nullable().describe('Sync transaction metadata for HLC conflict resolution'),
    batchUntilSeq: z
      .number()
      .int()
      .nullable()
      .describe('Last sequence position for a batched notification — client should fetch range'),
    count: z
      .number()
      .int()
      .nullable()
      .describe('Authoritative row count for batches: sequence ranges of different paths may interleave'),
    spreadWindow: z
      .number()
      .int()
      .nullable()
      .describe(
        'Server-suggested spread window (ms) for the lazy delta fetch; scales with channel audience and load, and the client clamps it between its priority tier bounds',
      ),
    propagation: propagationHintSchema
      .nullable()
      .describe('Embedded-product propagation hint for cross-product cache invalidation'),
  })
  .openapi('StreamNotification', {
    description: 'Realtime notification delivered via SSE for entity and membership changes.',
    example: mockStreamNotification(),
    'x-tags': schemaTags('data', 'entities', 'cella'),
  });

export type StreamNotification = z.infer<typeof streamNotificationSchema>;

/** One client view: a prefix set + entity types + the org-sequence cursor it has caught up to. */
export const catchupViewSchema = z.object({
  key: z.string().max(512).openapi({
    description: 'Client-chosen stable view key, echoed back verbatim to correlate responses',
  }),
  organizationId: z.string(),
  prefixes: z
    .array(z.string().max(512))
    .min(1)
    .max(64)
    .openapi({ description: 'Materialized id-path prefixes this view covers (root-first ids, slash-joined)' }),
  entityTypes: z.array(z.enum(appConfig.productEntityTypes)).min(1),
  depth: z.enum(['self', 'subtree']).optional().openapi({
    description:
      'View depth: subtree (default) covers rows at or below the prefix node; self covers only rows HOMED at the node (exact placement — a channel wall). Self views are answerable by direct home-scoped memberships.',
  }),
  cursor: z.number().int().min(0).openapi({
    description: 'Org-sequence position this view has fully ingested (0 = baseline not yet established)',
  }),
});

export type CatchupView = z.infer<typeof catchupViewSchema>;

/**
 * Body schema for stream catchup POST requests.
 * `views` is the sequence-sync contract: client-declared views over path prefixes with
 * org-sequence cursors, answered per view after prefix authorization.
 */
export const streamCatchupBodySchema = z.object({
  cursor: z.string().optional().openapi({
    description: 'Last activity cursor received by the client (LSN-based). Omit on first sync.',
    example: '0-16B3748',
  }),
  views: z.array(catchupViewSchema).max(256).optional().openapi({
    description: 'Client-declared views: prefix set + entity types + org-sequence cursor per view',
  }),
});

/**
 * Per-org catchup change summary (sequence sync). Product entity sync is answered per
 * VIEW (`catchupViewAnswerSchema`); this block carries the remaining org-level concerns:
 * the `membership` change signal and embedding propagation hints.
 */
export const catchupChangeSummarySchema = z.object({
  /** Org-level change signals: bump-only counters, no sequence semantics claimed. */
  signals: z.object({ membership: z.number().int().optional() }).optional(),
  /** Embedded-product propagation hints (embedded-product changes that require host cache patching) */
  propagation: z.array(propagationHintSchema).optional(),
});

export type CatchupChangeSummary = z.infer<typeof catchupChangeSummarySchema>;

/**
 * Per-view catchup answer. Summaries (`frontiers`, `counts`) are present only for
 * `status: 'ok'` views (unconditional read of the whole prefix subtree, see
 * `resolveViewReadStatus`); `opaque` views get no numbers and fall back to normal
 * staleness; `forbidden` views must be dropped by the client.
 */
export const catchupViewAnswerSchema = z.object({
  key: z.string().openapi({ description: 'The client-supplied view key, echoed verbatim' }),
  status: z.enum(['ok', 'opaque', 'forbidden']),
  frontiers: z.record(z.string(), z.number().int()).optional().openapi({
    description: 'Per-entityType newest sequence position over the view prefixes (subtree: f:{type}; self: fs:{type})',
  }),
  counts: z.record(z.string(), z.number().int()).optional().openapi({
    description: 'Per-entityType live row counts summed over the view prefixes (subtree: e:{type}; self: es:{type})',
  }),
});

export type CatchupViewAnswer = z.infer<typeof catchupViewAnswerSchema>;

/**
 * Catchup response schema for app stream.
 * `views` answers the client-declared views (sequence-sync contract); `changes` is the
 * legacy per-org summary, still authoritative for membership screening and propagation.
 */
export const appCatchupResponseSchema = z.object({
  changes: z.record(z.string(), catchupChangeSummarySchema).openapi({
    description: 'Per-org change summary: { [organizationId]: { signals?, propagation? } }',
  }),
  views: z.array(catchupViewAnswerSchema).optional().openapi({
    description: 'Per-view answers for client-declared views (same order as the request)',
  }),
  cursor: z.string().nullable().openapi({ description: 'Last activity ID (use as offset for next request)' }),
});

export type AppCatchupResponse = z.infer<typeof appCatchupResponseSchema>;
