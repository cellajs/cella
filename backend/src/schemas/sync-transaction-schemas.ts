import { z } from '@hono/zod-openapi';
import { mockStxRequest, mockStxResponse, mockStxStreamMessage } from '../../mocks/mock-entity-base';

/**
 * Sync transaction metadata sent with product entity mutations.
 * Enables conflict detection, idempotency, and sync tracking.
 */
export const stxRequestSchema = z
  .object({
    id: z.string().max(32).describe('Unique mutation ID (nanoid)'),
    sourceId: z.string().max(64).describe('Tab/instance identifier for echo prevention'),
    baseVersion: z.number().int().min(0).describe('Entity version when read (for conflict detection)'),
  })
  .openapi('StxRequest', { example: mockStxRequest() });

export type StxRequest = z.infer<typeof stxRequestSchema>;

/**
 * Sync transaction metadata returned in mutation responses.
 * Reflects the new entity state after mutation.
 */
export const stxResponseSchema = z
  .object({
    id: z.string().describe('Echoes the request mutation ID'),
    version: z.number().int().describe('New entity version after mutation'),
  })
  .openapi('StxResponse', { example: mockStxResponse() });

export type StxResponse = z.infer<typeof stxResponseSchema>;

/**
 * Sync transaction metadata in stream notifications.
 * Derived from StxBase on entity.
 */
export const stxStreamMessageSchema = z
  .object({
    id: z.string(),
    sourceId: z.string(),
    version: z.number().int(),
    fieldVersions: z.record(z.string(), z.number().int()),
  })
  .openapi('StxStreamMessage', { example: mockStxStreamMessage() });

export type StxStreamMessage = z.infer<typeof stxStreamMessageSchema>;
