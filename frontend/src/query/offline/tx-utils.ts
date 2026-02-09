/**
 * Transaction metadata utilities for offline mutations.
 *
 * Creates tx metadata for the { data, tx } wrapper pattern used by synced entities.
 * Uses nanoid for unique mutation IDs and version-based conflict detection.
 */

import { nanoid } from 'nanoid';

/**
 * Unique identifier for this browser tab/instance.
 * Generated once per page load, used for:
 * - Mutation source tracking (`tx.sourceId`)
 * - "Is this mine?" checks on stream notifications
 */
export const sourceId = `src_${nanoid()}`;

/** Transaction metadata sent to API in { data, tx } wrapper - matches TxRequest from api.gen */
export interface TxMetadata {
  /** Unique mutation ID (nanoid) */
  id: string;
  /** Tab/instance identifier for echo prevention */
  sourceId: string;
  /** Entity version when read (for conflict detection) */
  baseVersion: number;
}

/** Represents a JSONB type from the database that may contain tx metadata. */
type JsonbTx = string | number | boolean | null | { [key: string]: unknown } | unknown[];

/** Entity with optional tx column for version extraction */
type EntityWithTx = { tx?: JsonbTx };

/**
 * Extract version from JSONB tx column.
 * Handles the generic JSONB type from API responses.
 */
function extractVersion(tx: JsonbTx | undefined): number {
  if (!tx || typeof tx !== 'object' || Array.isArray(tx)) return 0;
  const version = tx.version;
  return typeof version === 'number' ? version : 0;
}

/**
 * Create transaction metadata for a create mutation.
 * Creates start at version 0 (no existing entity).
 */
export function createTxForCreate(): TxMetadata {
  return {
    id: nanoid(),
    sourceId,
    baseVersion: 0,
  };
}

/**
 * Create transaction metadata for an update mutation.
 * Extracts version from cached entity for conflict detection.
 *
 * @param cachedEntity - Entity from cache with optional tx.version
 */
export function createTxForUpdate(cachedEntity?: EntityWithTx | null): TxMetadata {
  return {
    id: nanoid(),
    sourceId,
    baseVersion: extractVersion(cachedEntity?.tx),
  };
}

/**
 * Create transaction metadata for a delete mutation.
 * Deletes use version 0 (no conflict detection needed).
 */
// TODO-044 tx should become stx to prevent confusion with postgres transaction.
export function createTxForDelete(): TxMetadata {
  return {
    id: nanoid(),
    sourceId,
    baseVersion: 0,
  };
}
