import type { StxBase } from 'sdk';
import { uuidv7 } from 'uuidv7';
import { createFieldTimestamps, sourceId } from './hlc';

export { sourceId };

/**
 * Create sync transaction metadata for a create mutation.
 * Creates have no field timestamps (server assigns initial values).
 */
export function createStxForCreate(): StxBase {
  return {
    mutationId: uuidv7(),
    sourceId,
    fieldTimestamps: {},
  };
}

/**
 * Sync transaction metadata for an update: HLC timestamps per changed scalar field.
 * AWSet fields (labels, assignedTo) need no timestamps (commutative).
 */
export function createStxForUpdate(scalarFieldNames: string[] = []): StxBase {
  return {
    mutationId: uuidv7(),
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
    mutationId: uuidv7(),
    sourceId,
    fieldTimestamps: {},
  };
}
