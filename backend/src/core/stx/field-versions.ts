import { compareHLC } from './hlc';

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** Drops primitive fields equal to the stored value; arrays and objects pass through without deep comparison. */
export function filterNoOpFields<T extends Record<string, unknown>>(
  entityData: Record<string, unknown>,
  incomingFields: T,
): T {
  const result = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(incomingFields)) {
    if (isPrimitive(value) && entityData[key] === value) continue;
    result[key] = value;
  }
  return result as T;
}

/** Per-field LWW: accept a scalar when its incoming HLC is greater than the HLC stored in the entity's stx. */
export function resolveFieldConflicts<T extends Record<string, unknown>>(
  incomingFields: T,
  incomingTimestamps: Record<string, string>,
  storedTimestamps: Record<string, string>,
): Partial<T> {
  const acceptedFields = {} as Partial<T>;

  for (const field of Object.keys(incomingFields)) {
    const incomingHLC = incomingTimestamps[field];
    const storedHLC = storedTimestamps[field];

    if (!incomingHLC) throw new Error(`Missing HLC timestamp for scalar field "${field}"`);
    if (!storedHLC || compareHLC(incomingHLC, storedHLC) > 0) {
      (acceptedFields as Record<string, unknown>)[field] = incomingFields[field];
    }
  }

  return acceptedFields;
}
