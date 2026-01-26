import { jsonb } from 'drizzle-orm/pg-core';

/**
 * Transaction metadata for sync tracking and conflict detection.
 * Written by handler, read by CDC Worker, overwritten on next mutation.
 */
export interface TxColumnData {
  /** Unique mutation ID (nanoid) */
  id: string;
  /** Tab/instance identifier for echo prevention */
  sourceId: string;
  /** Entity version - incremented on every mutation */
  version: number;
  /** Per-field versions for conflict detection */
  fieldVersions: Record<string, number>;
}

/**
 * Transaction column for sync-enabled entities.
 * Used to track mutations and enable conflict detection via CDC Worker.
 */
export const txColumns = {
  tx: jsonb().$type<TxColumnData>(),
};
