import type { StxBase } from 'sdk';
import { uuidv7 } from 'uuidv7';
import { createFieldTimestamps, sourceId } from './hlc';
import { hasPaused } from './mutation-queue';

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

/**
 * Flags a replayed offline update so the server arbitrates it by its field timestamps (intent time).
 * A live edit carries no flag and is ordered by server arrival, so a skewed device clock cannot lose it.
 */
export function withReplayFlag(stx: StxBase): StxBase {
  return hasPaused(stx.mutationId) ? { ...stx, replayed: true } : stx;
}

/** Deletes carry no field timestamps. */
export function createStxForDelete(): StxBase {
  return {
    mutationId: uuidv7(),
    sourceId,
    fieldTimestamps: {},
  };
}
