import { z } from '@hono/zod-openapi';
import { mockStxBase, mockStxRequest, mockStxResponse } from '../../mocks/mock-entity-base';

/**
 * Zod schema for StxBase (sync transaction base).
 * Stored on product entities for sync/offline support.
 *
 * Uses HLC-based per-field timestamps instead of version counters.
 */
export const stxBaseSchema = z
  .object({
    mutationId: z.string(),
    sourceId: z.string(),
    fieldTimestamps: z.record(z.string(), z.string()),
  })
  .openapi('StxBase', {
    description: 'Sync transaction metadata stored on entities for offline and realtime support.',
    example: mockStxBase(),
  });

export type StxBase = z.infer<typeof stxBaseSchema>;

/**
 * Sync transaction metadata sent with product entity mutations.
 * Enables HLC-based conflict resolution, idempotency, and sync tracking.
 */
export const stxRequestSchema = z
  .object({
    mutationId: z.string().max(32).describe('Unique mutation ID (nanoid)'),
    sourceId: z.string().max(64).describe('Tab/instance identifier for echo prevention'),
    fieldTimestamps: z
      .record(z.string(), z.string())
      .describe('Per-field HLC timestamps for scalar fields being changed'),
  })
  .openapi('StxRequestBase', {
    description: 'Sync transaction metadata sent with mutations for idempotency and HLC-based conflict resolution.',
    example: mockStxRequest(),
  });

export type StxRequest = z.infer<typeof stxRequestSchema>;

/**
 * Sync transaction metadata returned in mutation responses.
 * Reflects the new entity state after mutation.
 */
export const stxResponseSchema = z
  .object({
    mutationId: z.string().describe('Echoes the request mutation ID'),
    droppedFields: z.array(z.string()).default([]).describe('Fields whose HLC lost and were silently dropped'),
  })
  .openapi('StxResponseBase', {
    description: 'Sync transaction acknowledgment returned after a mutation.',
    example: mockStxResponse(),
  });

export type StxResponse = z.infer<typeof stxResponseSchema>;
