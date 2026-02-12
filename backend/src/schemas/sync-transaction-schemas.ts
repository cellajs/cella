import { z } from '@hono/zod-openapi';
import { mockStxBase, mockStxRequest, mockStxResponse } from '../../mocks/mock-entity-base';

/**
 * Zod schema for StxBase (sync transaction base).
 * Stored on product entities for sync/offline support.
 */
export const stxBaseSchema = z
  .object({
    mutationId: z.string(),
    sourceId: z.string(),
    version: z.number().int(),
    fieldVersions: z.record(z.string(), z.number().int()),
  })
  .openapi('StxBase', {
    description: 'Sync transaction metadata stored on entities for offline and realtime support.',
    example: mockStxBase(),
  });

export type StxBase = z.infer<typeof stxBaseSchema>;

/**
 * Sync transaction metadata sent with product entity mutations.
 * Enables conflict detection, idempotency, and sync tracking.
 */
export const stxRequestSchema = z
  .object({
    mutationId: z.string().max(32).describe('Unique mutation ID (nanoid)'),
    sourceId: z.string().max(64).describe('Tab/instance identifier for echo prevention'),
    lastReadVersion: z.number().int().min(0).describe('Entity version when last read (for conflict detection)'),
  })
  .openapi('StxRequestBase', {
    description: 'Sync transaction metadata sent with mutations for idempotency and conflict detection.',
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
    version: z.number().int().describe('New entity version after mutation'),
  })
  .openapi('StxResponseBase', {
    description: 'Sync transaction acknowledgment returned after a mutation.',
    example: mockStxResponse(),
  });

export type StxResponse = z.infer<typeof stxResponseSchema>;
