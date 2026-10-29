import { z } from '@hono/zod-openapi';
import { activityActions, appConfig } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { mockStreamChange, mockStreamSignal } from '#/schemas/stream-mocks';
import { nullableStxBaseSchema } from '#/schemas/sync-transaction-schemas';

const propagationHintSchema = z.object({
  embeddedProduct: z.enum(appConfig.productEntityTypes).describe('Embedded product type whose change triggered the propagation'),
  hostProduct: z.enum(appConfig.productEntityTypes).describe('Host product type whose cache should be patched'),
  hostColumn: z.string().describe('Column on the host product that embeds the changed product'),
  update: z.array(z.string()).describe('Embedded row IDs whose cached copies in host rows need a refresh'),
  remove: z.array(z.string()).describe('Embedded row IDs (deleted or soft deleted) that host rows drop'),
});

/** Clients fetch the changed rows separately. */
export const streamChangeSchema = z
  .object({
    action: z
      .enum([...activityActions, 'moveOut'] as const)
      .describe('Change kind; moveOut = the row left this path (reparent) and is no longer readable there'),
    productType: z.enum(appConfig.productEntityTypes),
    subjectId: z.string(),
    organizationId: z.string(),
    tenantId: z.string().nullable(),
    path: z.string().nullable().describe('Id path of the affected rows (root-first ancestor ids); moveOut carries the OLD path'),
    seq: z.number().int().nullable().describe('Org-sequence position (one order per organization, shared across product entity types)'),
    channelId: z.string().nullable().describe('Deepest channel entity ID above the rows, which groups unseen counts'),
    stx: nullableStxBaseSchema,
    actorId: z
      .string()
      .nullable()
      .describe('Actor whose write the activity records; a tab takes the change as its own echo only when this is its signed-in user'),
    batchUntilSeq: z.number().int().nullable().describe('Last sequence position for a batched change: client should fetch range'),
    count: z.number().int().nullable().describe('Exact row count for batches: sequence ranges of different paths may interleave'),
    spreadWindow: z
      .number()
      .int()
      .nullable()
      .describe(
        'Server-suggested spread window (ms) for the lazy range fetch; scales with channel audience and load, and the client clamps it between its priority tier bounds',
      ),
    propagation: propagationHintSchema.nullable().describe('Embedded-product propagation hint for cross-product cache invalidation'),
  })
  .openapi('StreamChange', {
    description:
      'A live change of product rows, naming the rows, their path and sequence range but not their content. It arrives as a `change` event on `/entities/app/stream`; the client then fetches the changed rows through the regular API.',
    example: mockStreamChange(),
    'x-tags': schemaTags('data', 'entities', 'cella'),
  });

export type StreamChange = z.infer<typeof streamChangeSchema>;

/** Ids only: what a handler shows, it reads through the regular API. */
export const streamSignalSchema = z
  .object({
    type: z.string().describe('Registered signal type, `<module>.<past tense>` (e.g. membership.changed, notification.created)'),
    organizationId: z.string().nullable(),
    subjectId: z.string().nullable().describe('The one row the signal is about; null when it is about the organization as a whole'),
    version: z.number().int().nullable().describe('Counter value of a versioned signal, when the sender knows it; catchup returns the stored one'),
  })
  .openapi('StreamSignal', {
    description:
      'A live message that something which is not a product row changed, such as a membership or an inbox row. It arrives as a `signal` event on `/entities/app/stream`; the handler the type registers refetches what it shows.',
    example: mockStreamSignal(),
    'x-tags': schemaTags('data', 'entities', 'cella'),
  });

export type StreamSignal = z.infer<typeof streamSignalSchema>;

/** One client view: a prefix set + entity types + the org-sequence cursor it has caught up to. */
const catchupViewSchema = z.object({
  key: z.string().max(512).openapi({ description: 'Client-chosen stable view key, echoed back verbatim to correlate responses' }),
  organizationId: z.string(),
  prefixes: z.array(z.string().max(512)).min(1).max(64).openapi({ description: 'Id path prefixes this view covers (root-first ids, slash-joined)' }),
  entityTypes: z.array(z.enum(appConfig.productEntityTypes)).min(1).max(64),
  depth: z.enum(['self', 'subtree']).optional().openapi({
    description:
      'View depth: subtree (default) covers rows at or below the prefix node; self covers only rows HOMED at the node (exact placement: a channel wall). Self views are answerable by direct home-scoped memberships.',
  }),
  cursor: z.number().int().min(0).openapi({ description: 'Org-sequence position this view has fully ingested (0 = baseline not yet established)' }),
});

export type CatchupView = z.infer<typeof catchupViewSchema>;

/** `views` is the sequence-sync contract: prefix views with org-sequence cursors, answered after prefix authorization. */
export const streamCatchupBodySchema = z.object({
  cursor: z.string().optional().openapi({
    description: 'Id of the last activity the client received (its commit position and index). Omit on first sync.',
    example: '00000000-016B3748-00000001',
  }),
  views: z
    .array(catchupViewSchema)
    .max(256)
    .optional()
    .openapi({ description: 'Client-declared views: prefix set + entity types + org-sequence cursor per view' }),
});

/** Product entity sync is answered per view (`catchupViewAnswerSchema`); this carries the org-level concerns. */
const catchupOrganizationSummarySchema = z.object({
  signals: z
    .record(z.string(), z.number().int())
    .optional()
    .openapi({ description: 'Versions by signal type: bump-only counters a client compares with the ones it stored' }),
  /** Embedded-product changes that require patching the host's cache. */
  propagation: z.array(propagationHintSchema).optional(),
});

export type CatchupOrganizationSummary = z.infer<typeof catchupOrganizationSummarySchema>;

/**
 * `frontiers` and `counts` are present only for `status: 'ok'` views (unconditional read of the whole prefix
 * subtree). `opaque` views get no numbers and fall back to normal staleness; `forbidden` views must be dropped.
 */
const catchupViewAnswerSchema = z.object({
  key: z.string().openapi({ description: 'The client-supplied view key, echoed verbatim' }),
  status: z.enum(['ok', 'opaque', 'forbidden']),
  frontiers: z
    .record(z.string(), z.number().int())
    .optional()
    .openapi({ description: 'Per-entityType newest sequence position over the view prefixes (subtree: e:f:{type}; self: e:f:h:{type})' }),
  counts: z
    .record(z.string(), z.number().int())
    .optional()
    .openapi({ description: 'Per-entityType live row counts summed over the view prefixes (subtree: e:c:{type}; self: e:c:h:{type})' }),
});

export type CatchupViewAnswer = z.infer<typeof catchupViewAnswerSchema>;

/** `views` answers the client-declared views; `organizations` holds per organization its signal versions and propagation hints. */
export const appCatchupResponseSchema = z.object({
  organizations: z
    .record(z.string(), catchupOrganizationSummarySchema)
    .openapi({ description: 'Per organization: signal versions and propagation hints, { [organizationId]: { signals?, propagation? } }' }),
  views: z
    .array(catchupViewAnswerSchema)
    .optional()
    .openapi({ description: 'Per-view answers for client-declared views (same order as the request)' }),
  cursor: z.string().nullable().openapi({ description: 'Last activity ID (use as offset for next request)' }),
  generation: z.number().int().optional().openapi({
    description: 'Generation of the sync books. A client that holds another one refetches its synced data and takes the frontiers as baselines',
  }),
});

export type AppCatchupResponse = z.infer<typeof appCatchupResponseSchema>;
