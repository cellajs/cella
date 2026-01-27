import { jsonb } from 'drizzle-orm/pg-core';
import { nanoid } from '#/utils/nanoid';

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
 * Create transaction metadata for server-side entity creation.
 * Use this for system-generated entities (seeds, imports, background jobs)
 * that bypass the normal client mutation flow.
 */
export function createServerTx(): TxColumnData {
  return {
    id: nanoid(),
    sourceId: 'server',
    version: 1,
    fieldVersions: {},
  };
}

/**
 * Transaction column for sync-enabled entities (offline/realtime).
 * Used to track mutations and enable conflict detection via CDC Worker.
 * Required (notNull) because all offline/realtime entity mutations MUST include tx metadata.
 */
export const txColumns = {
  tx: jsonb().$type<TxColumnData>().notNull(),
};
