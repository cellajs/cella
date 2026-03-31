/**
 * Sync transaction metadata utilities for offline mutations.
 *
 * Creates stx metadata for synced entity mutations.
 * Uses nanoid for unique mutation IDs and HLC-based per-field timestamps.
 */

import type { StxBase } from 'sdk';
import { nanoid } from 'shared/nanoid';
import { createFieldTimestamps, sourceId } from './hlc';

export { sourceId };

/**
 * Create sync transaction metadata for a create mutation.
 * Creates have no field timestamps (server assigns initial values).
 */
export function createStxForCreate(): StxBase {
  return {
    mutationId: nanoid(),
    sourceId,
    fieldTimestamps: {},
  };
}

/**
 * Create sync transaction metadata for an update mutation.
 * Generates HLC timestamps for each scalar field being changed.
 * AWSet fields (labels, assignedTo) don't need timestamps (commutative).
 *
 * @param scalarFieldNames - Names of scalar fields being updated
 */
export function createStxForUpdate(scalarFieldNames: string[] = []): StxBase {
  return {
    mutationId: nanoid(),
    sourceId,
    fieldTimestamps: createFieldTimestamps(scalarFieldNames),
  };
}

/**
 * Create sync transaction metadata for a delete mutation.
 * Deletes have no field timestamps.
 */
export function createStxForDelete(): StxBase {
  return {
    mutationId: nanoid(),
    sourceId,
    fieldTimestamps: {},
  };
}
