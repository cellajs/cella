import { isDeepStrictEqual } from 'node:util';
import { compareHLC, isBeyondClockSkew, isValidHLC } from '#/core/stx/hlc';

/** The fields whose value differs from the stored one: an equal array or object, in any key order, is no change. */
export function filterNoOpFields<T extends Record<string, unknown>>(stored: Record<string, unknown>, incoming: T): Partial<T> {
  const changed: Partial<T> = {};
  for (const key in incoming) {
    if (!isDeepStrictEqual(stored[key], incoming[key])) changed[key] = incoming[key];
  }
  return changed;
}

/**
 * Per-field LWW: accept a scalar when its incoming HLC is greater than the HLC stored in the entity's stx. A stored
 * stamp outside the HLC form, or beyond the clock skew bound, loses, so the write replaces it.
 */
export function resolveFieldConflicts(
  incomingFields: Record<string, unknown>,
  incomingTimestamps: Record<string, string>,
  storedTimestamps: Record<string, string>,
): Record<string, unknown> {
  const acceptedFields: Record<string, unknown> = {};

  for (const field of Object.keys(incomingFields)) {
    const incomingHLC = incomingTimestamps[field];
    const storedHLC = storedTimestamps[field];

    if (!incomingHLC) throw new Error(`Missing HLC timestamp for scalar field "${field}"`);
    if (!storedHLC || !isValidHLC(storedHLC) || isBeyondClockSkew(storedHLC) || compareHLC(incomingHLC, storedHLC) > 0) {
      acceptedFields[field] = incomingFields[field];
    }
  }

  return acceptedFields;
}
