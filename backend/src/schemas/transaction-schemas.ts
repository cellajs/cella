import { z } from '@hono/zod-openapi';

/**
 * Transaction metadata sent with product entity mutations.
 * Enables conflict detection, idempotency, and sync tracking.
 */
export const txRequestSchema = z
  .object({
    transactionId: z.string().max(64).describe('Client-generated unique ID (HLC format: timestamp.logical.nodeId)'),
    sourceId: z.string().max(64).describe('Tab/instance identifier'),
    changedField: z.string().max(64).nullable().describe('Which field this mutation changes (null for create/delete)'),
    expectedTransactionId: z
      .string()
      .max(64)
      .nullable()
      .describe('Last known transaction ID for this field (null for create or first write)'),
  })
  .openapi('TxRequest');

export type TxRequest = z.infer<typeof txRequestSchema>;

/**
 * Transaction metadata returned in mutation responses.
 */
export const txResponseSchema = z
  .object({
    transactionId: z.string().describe('Echoes the request transactionId'),
  })
  .openapi('TxResponse');

export type TxResponse = z.infer<typeof txResponseSchema>;

/**
 * Transaction metadata in stream messages.
 */
export const txStreamMessageSchema = z
  .object({
    transactionId: z.string().nullable(),
    sourceId: z.string().nullable(),
    changedField: z.string().nullable(),
  })
  .openapi('TxStreamMessage');

export type TxStreamMessage = z.infer<typeof txStreamMessageSchema>;

/**
 * Factory to create a tx-wrapped mutation request schema.
 * Use for product entity POST/PATCH/DELETE routes.
 *
 * @example
 * const createPageBodySchema = createTxMutationSchema(createPageSchema);
 * // Result: { data: CreatePageSchema, tx: TxRequestSchema }
 */
export const createTxMutationSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    tx: txRequestSchema,
  });
