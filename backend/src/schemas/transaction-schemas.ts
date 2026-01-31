import { z } from '@hono/zod-openapi';
import { mockTxRequest, mockTxResponse, mockTxStreamMessage } from '../../mocks/mock-entity-base';

/**
 * Transaction metadata sent with product entity mutations.
 * Enables conflict detection, idempotency, and sync tracking.
 */
export const txRequestSchema = z
  .object({
    id: z.string().max(32).describe('Unique mutation ID (nanoid)'),
    sourceId: z.string().max(64).describe('Tab/instance identifier for echo prevention'),
    baseVersion: z.number().int().min(0).describe('Entity version when read (for conflict detection)'),
  })
  .openapi('TxRequest', { example: mockTxRequest() });

export type TxRequest = z.infer<typeof txRequestSchema>;

/**
 * Transaction metadata returned in mutation responses.
 * Reflects the new entity state after mutation.
 */
export const txResponseSchema = z
  .object({
    id: z.string().describe('Echoes the request mutation ID'),
    version: z.number().int().describe('New entity version after mutation'),
  })
  .openapi('TxResponse', { example: mockTxResponse() });

export type TxResponse = z.infer<typeof txResponseSchema>;

/**
 * Transaction metadata in stream notifications.
 * Derived from TxBase on entity.
 */
export const txStreamMessageSchema = z
  .object({
    id: z.string(),
    sourceId: z.string(),
    version: z.number().int(),
    fieldVersions: z.record(z.string(), z.number().int()),
  })
  .openapi('TxStreamMessage', { example: mockTxStreamMessage() });

export type TxStreamMessage = z.infer<typeof txStreamMessageSchema>;
