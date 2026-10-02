import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { isValidHLC } from '#/core/stx/hlc';
import { mockStxBase } from './sync-transaction-mocks';

/** Used for both storage and request validation. */
export const stxBaseSchema = z
  .object({
    mutationId: z.string().max(36).describe('Unique mutation ID'),
    sourceId: z.string().max(64).describe('Tab/instance identifier for echo prevention'),
    fieldTimestamps: z
      .record(z.string(), z.string().refine(isValidHLC, 'Invalid HLC timestamp'))
      .describe('Per-field HLC timestamps for scalar fields being changed'),
    replayed: z.boolean().optional().describe('Set on a paused offline mutation being replayed: its field timestamps then arbitrate as intent time'),
  })
  .openapi('StxBase', {
    description:
      'The sync envelope on every product write: a mutation ID, a source ID and per-field timestamps. Clients send it with each create and update; the server merges concurrent edits by its timestamps, and a client recognizes its own writes coming back by the source ID.',
    example: mockStxBase(),
    'x-tags': schemaTags('base', 'cella'),
  });

/** Unnamed, so each use site emits an inline `anyOf: [$ref, {type: 'null'}]`. */
export const nullableStxBaseSchema = z.union([stxBaseSchema, z.null()]);

export type StxBase = z.infer<typeof stxBaseSchema>;
