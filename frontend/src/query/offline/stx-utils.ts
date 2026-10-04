import type { StxBase } from 'sdk';
import { uuidv7 } from 'uuidv7';
import { createFieldTimestamps, sourceId } from './hlc';

export { sourceId };

/** Creates carry no field timestamps: the server assigns the initial values. */
export function createStxForCreate(): StxBase {
  return { mutationId: uuidv7(), sourceId, fieldTimestamps: {} };
}

/**
 * HLC timestamps per changed scalar field. AWSet fields are commutative and need none. Build it when the edit is made
 * and pass it in the mutation's variables: an update that pauses offline is then flagged `replayed` there (the query
 * client does it), so the server arbitrates it by these timestamps. A live edit carries no flag and is ordered by
 * server arrival, so a skewed device clock cannot lose it.
 */
export function createStxForUpdate(scalarFieldNames: string[] = []): StxBase {
  return { mutationId: uuidv7(), sourceId, fieldTimestamps: createFieldTimestamps(scalarFieldNames) };
}

/** Deletes carry no field timestamps either, so they share the create stx. */
export const createStxForDelete = createStxForCreate;
