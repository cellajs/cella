import { compareHLC, isBeyondClockSkew, isValidHLC } from '#/core/stx/hlc';

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** Drops primitive fields equal to the stored value; arrays and objects pass through without deep comparison. */
export function filterNoOpFields(entityData: Record<string, unknown>, incomingFields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(incomingFields).filter(([key, value]) => !(isPrimitive(value) && entityData[key] === value)));
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
