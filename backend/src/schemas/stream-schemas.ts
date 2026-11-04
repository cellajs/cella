import { z } from '@hono/zod-openapi';
import { activityActions, appConfig } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { maxStreamChangeIds } from '#/modules/entities/stream/helpers';
import { validIdSchema } from '#/schemas/common-schemas';
import { mockStreamChange, mockStreamSignal } from '#/schemas/stream-mocks';
import { nullableStxBaseSchema } from '#/schemas/sync-transaction-schemas';

/** The client patches every host column its own productEmbeddings config declares for the embedded product. */
const propagationHintSchema = z.object({
  embeddedProduct: z.enum(appConfig.productEntityTypes).describe('Embedded product type whose change triggered the propagation'),
  update: z.array(z.string()).describe('Embedded row IDs whose cached copies in host rows need a refresh'),
  remove: z.array(z.string()).describe('Embedded row IDs (deleted or soft deleted) that host rows drop'),
});

const catchupPropagationHintSchema = propagationHintSchema.extend({
  overflow: z
    .boolean()
    .optional()
    .describe(
      'Set when more embedded rows changed than one hint names: `update` and `remove` are then empty, and the host lists of the organization refetch',
    ),
  untilSeq: z
    .number()
    .int()
    .optional()
    .describe(
      "Highest sequence position among the rows the hint read, which the caller may all read: a client whose view of the embedded product is opaque takes it as that view's cursor",
    ),
});

/** One row a change frame names: no content, the client fetches it. */
const streamChangeRowSchema = z.object({
  subjectId: z.string(),
  seq: z
    .number()
    .int()
    .nullable()
    .describe(
      'Org-sequence position (one order per organization, shared across product entity types); null on a delete and on a move-out whose row has left its table',
    ),
  stx: nullableStxBaseSchema,
  actorId: z
    .string()
    .nullable()
    .describe('Actor whose write the activity records; a tab takes the row as its own echo only when this is its signed-in user'),
});

/** Clients fetch the changed rows separately. */
export const streamChangeSchema = z
  .object({
    action: z
      .enum([...activityActions, 'moveOut'] as const)
      .describe('Change kind; moveOut = the row left the channel the receiver read it under (reparent) and is no longer readable there'),
    productType: z.enum(appConfig.productEntityTypes),
    organizationId: z.string(),
    tenantId: z.string(),
    channelId: z.string().nullable().describe('Deepest channel entity ID above the rows, which groups unseen counts'),
    rows: z
      .array(streamChangeRowSchema)
      .describe(
        'The rows the receiver may read, in commit order; their sequence positions need not be contiguous, since rows of other paths interleave',
      ),
    overflow: z
      .object({
        afterSeq: z.number().int().nullable(),
        untilSeq: z.number().int().nullable(),
        subjectIds: z
          .array(z.string())
          .nullable()
          .describe(
            `The ids of the rows when they are at most ${maxStreamChangeIds}, in commit order; null past that, when a delete or a move-out refetches the lists of the type`,
          ),
      })
      .nullable()
      .describe(
        'Set when the receiver may read more rows than one frame names in full, and `rows` and the propagation hint are then empty: the sequence range of a create or update to fetch, nulls on a delete or a move-out',
      ),
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
      'A live change of product rows, naming each row with its sequence position and the write that changed it, but not their content. It arrives as a `change` event on `/entities/app/stream`; the client then fetches the changed rows through the regular API.',
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
    version: z
      .number()
      .int()
      .optional()
      .describe(
        "A versioned signal's version on its organization after the change it is about, as catchup returns it; absent on any other signal, from a worker of an earlier release and on a change delivered again",
      ),
  })
  .openapi('StreamSignal', {
    description:
      'A live message that something which is not a product row changed, such as a membership or an inbox row. It arrives as a `signal` event on `/entities/app/stream`; the handler the type registers refetches what it shows.',
    example: mockStreamSignal(),
    'x-tags': schemaTags('data', 'entities', 'cella'),
  });

export type StreamSignal = z.infer<typeof streamSignalSchema>;

/** One client view: the org-sequence cursor it has caught up to for one product type of one organization. */
const catchupViewSchema = z.object({
  organizationId: validIdSchema,
  entityType: z.enum(appConfig.productEntityTypes),
  cursor: z.number().int().min(0).openapi({ description: 'Org-sequence position this view has fully ingested (0 = baseline not yet established)' }),
});

export type CatchupView = z.infer<typeof catchupViewSchema>;

/** `views` is the sequence-sync contract: one view per organization and product type, answered after authorization. */
export const streamCatchupBodySchema = z.object({
  views: z
    .array(catchupViewSchema)
    .max(256)
    .optional()
    .openapi({ description: 'Client-declared views: an organization, a product type and its org-sequence cursor per view' }),
});

/** Product entity sync is answered per view (`catchupViewAnswerSchema`); this carries the org-level concerns. */
const catchupOrganizationSummarySchema = z.object({
  signals: z
    .record(z.string(), z.number().int())
    .optional()
    .openapi({ description: 'Versions by signal type: bump-only counters a client compares with the ones it stored' }),
  /** Embedded-product changes that require patching the host's cache: one hint per embedded product. */
  propagation: z.array(catchupPropagationHintSchema).optional(),
});

export type CatchupOrganizationSummary = z.infer<typeof catchupOrganizationSummarySchema>;

/**
 * `frontier` is present only for `status: 'ok'` (unconditional read of every row of the type in the organization).
 * `opaque` views get no number and fall back to normal staleness; `forbidden` views must be dropped.
 */
const catchupViewAnswerSchema = z.object({
  organizationId: z.string(),
  entityType: z.enum(appConfig.productEntityTypes),
  status: z.enum(['ok', 'opaque', 'forbidden']),
  frontier: z.number().int().optional().openapi({ description: 'Newest sequence position of the type in the organization' }),
});

/** `views` answers the client-declared views; `organizations` holds per organization its signal versions and propagation hints. */
export const appCatchupResponseSchema = z.object({
  organizations: z
    .record(z.string(), catchupOrganizationSummarySchema)
    .openapi({ description: 'Per organization: signal versions and propagation hints, { [organizationId]: { signals?, propagation? } }' }),
  views: z.array(catchupViewAnswerSchema).openapi({ description: 'Per-view answers for client-declared views (same order as the request)' }),
  generation: z.number().int().openapi({
    description: 'Generation of the sync books. A client that holds another one refetches its synced data and takes the frontiers as baselines',
  }),
});

export type AppCatchupResponse = z.infer<typeof appCatchupResponseSchema>;
