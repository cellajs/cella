import type { StxBase } from 'sdk';
import { uuidv7 } from 'uuidv7';
import { createFieldTimestamps, sourceId } from './hlc';

export { sourceId };

/** Creates carry no field timestamps: the server assigns the initial values. */
export function createStxForCreate(): StxBase {
  return {
    mutationId: uuidv7(),
    sourceId,
    fieldTimestamps: {},
  };
}

/** HLC timestamps per changed scalar field. AWSet fields are commutative and need none. */
export function createStxForUpdate(scalarFieldNames: string[] = []): StxBase {
  return {
    mutationId: uuidv7(),
    sourceId,
    fieldTimestamps: createFieldTimestamps(scalarFieldNames),
  };
}

/** Deletes carry no field timestamps. */
export function createStxForDelete(): StxBase {
  return {
    mutationId: uuidv7(),
    sourceId,
    fieldTimestamps: {},
  };
}
