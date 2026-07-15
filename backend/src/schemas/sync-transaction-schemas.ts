import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { isValidHLC } from '#/core/stx/hlc';
import { mockStxBase } from './sync-transaction-mocks';

/**
 * Zod schema for StxBase (sync transaction base).
 * Used for both storage and request validation.
 *
 * Enables HLC-based conflict resolution, idempotency, and sync tracking.
 */
export const stxBaseSchema = z
  .object({
    mutationId: z.string().max(36).describe('Unique mutation ID'),
    sourceId: z.string().max(64).describe('Tab/instance identifier for echo prevention'),
    fieldTimestamps: z
      .record(z.string(), z.string().refine(isValidHLC, 'Invalid HLC timestamp'))
      .describe('Per-field HLC timestamps for scalar fields being changed'),
  })
  .openapi('StxBase', {
    description:
      'Sync transaction metadata for offline and realtime support, idempotency and HLC-based conflict resolution.',
    example: mockStxBase(),
    'x-tags': schemaTags('base', 'cella'),
  });

export type StxBase = z.infer<typeof stxBaseSchema>;
