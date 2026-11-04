import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { hlcMaxLength, isValidHLC } from '#/core/stx/hlc';
import { boundedRecord, idsBodySchema } from '#/schemas/common-schemas';
import { mockStxBase, mockStxStored } from '#/schemas/sync-transaction-mocks';

/** Used for both storage and request validation. */
export const stxBaseSchema = z
  .object({
    mutationId: z.string().max(36).describe('Unique mutation ID'),
    sourceId: z.string().max(64).describe('Tab/instance identifier for echo prevention'),
    // More keys than any product has scalar fields.
    fieldTimestamps: boundedRecord(z.string().max(hlcMaxLength).refine(isValidHLC, 'Invalid HLC timestamp'), 100).describe(
      'Per-field HLC timestamps for scalar fields being changed',
    ),
    replayed: z.boolean().optional().describe('Set on a paused offline mutation being replayed: its field timestamps then arbitrate as intent time'),
  })
  .openapi('StxBase', {
    description:
      'The sync envelope on every product write: a mutation ID, a source ID and per-field timestamps. Clients send it with each create and update; the server merges concurrent edits by its timestamps, and a client recognizes its own writes coming back by the source ID.',
    example: mockStxBase(),
    'x-tags': schemaTags('base', 'cella'),
  });

export const nullableStxBaseSchema = z.union([stxBaseSchema, z.null()]);

export type StxBase = z.infer<typeof stxBaseSchema>;

/** A product row's stx after a write: the base plus the fields the write changed, which the server sets. */
export const stxStoredSchema = stxBaseSchema
  .extend({
    changedFields: z
      .array(z.string().max(64))
      .max(100)
      .optional()
      .describe('The fields the last write changed, set by the server; absent after a create or a server-driven write'),
  })
  .openapi('StxStored', {
    description:
      'The sync envelope as a product row stores and returns it: StxBase plus changedFields, the fields the last write changed, which the server sets and the Yjs materializer reads. A request carries StxBase only.',
    example: mockStxStored(),
    'x-tags': schemaTags('base', 'cella'),
  });

export type StxStored = z.infer<typeof stxStoredSchema>;

/** The optional stx is what prevents echoing the change back to its source. */
export const idsWithStxBodySchema = (maxItems = 50) =>
  idsBodySchema(maxItems).extend({ stx: stxBaseSchema.pick({ mutationId: true, sourceId: true }).optional() });
