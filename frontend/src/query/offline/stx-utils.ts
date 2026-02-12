/**
 * Sync transaction metadata utilities for offline mutations.
 *
 * Creates stx metadata for the { data, stx } wrapper pattern used by synced entities.
 * Uses nanoid for unique mutation IDs and version-based conflict detection.
 */

import { nanoid } from 'nanoid';
import type { StxRequestBase } from '~/api.gen';

/**
 * Unique identifier for this browser tab/instance.
 * Generated once per page load, used for:
 * - Mutation source tracking (`stx.sourceId`)
 * - "Is this mine?" checks on stream notifications
 */
export const sourceId = `src_${nanoid()}`;

/** Sync transaction metadata sent to API in { data, stx } wrapper - reuses StxRequestBase from api.gen */
export type StxMetadata = StxRequestBase;

/** Represents a JSONB type from the database that may contain stx metadata. */
type JsonbStx = string | number | boolean | null | { [key: string]: unknown } | unknown[];

/** Entity with optional stx column for version extraction */
type EntityWithStx = { stx?: JsonbStx };

/**
 * Extract version from JSONB stx column.
 * Handles the generic JSONB type from API responses.
 */
function extractVersion(stx: JsonbStx | undefined): number {
  if (!stx || typeof stx !== 'object' || Array.isArray(stx)) return 0;
  const version = stx.version;
  return typeof version === 'number' ? version : 0;
}

/**
 * Create sync transaction metadata for a create mutation.
 * Creates start at version 0 (no existing entity).
 */
export function createStxForCreate(): StxMetadata {
  return {
    mutationId: nanoid(),
    sourceId,
    lastReadVersion: 0,
  };
}

/**
 * Create sync transaction metadata for an update mutation.
 * Extracts version from cached entity for conflict detection.
 *
 * @param cachedEntity - Entity from cache with optional stx.version
 */
export function createStxForUpdate(cachedEntity?: EntityWithStx | null): StxMetadata {
  return {
    mutationId: nanoid(),
    sourceId,
    lastReadVersion: extractVersion(cachedEntity?.stx),
  };
}

/**
 * Create sync transaction metadata for a delete mutation.
 * Deletes use version 0 (no conflict detection needed).
 */
export function createStxForDelete(): StxMetadata {
  return {
    mutationId: nanoid(),
    sourceId,
    lastReadVersion: 0,
  };
}
