import { jsonb } from 'drizzle-orm/pg-core';

/**
 * Transaction metadata for sync tracking and conflict detection.
 * Written by handler, read by CDC Worker, overwritten on next mutation.
 */
export interface TxColumnData {
  /** Client-generated transaction ID (HLC format) */
  transactionId: string;
  /** Tab/instance identifier */
  sourceId: string;
  /** Which field this mutation changes (null for create/delete) */
  changedField: string | null;
  /** Last known transaction ID for this field (for conflict detection) */
  expectedTransactionId?: string | null;
}

/**
 * Transaction column for sync-enabled entities.
 * Used to track mutations and enable conflict detection via CDC Worker.
 */
export const txColumns = {
  tx: jsonb().$type<TxColumnData>(),
};
