import { compareHLC } from './hlc';

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * Filter out primitive fields where the incoming value is identical to the current entity value.
 * Non-primitive fields (arrays, objects) are kept without deep equality checks.
 * Returns a new object with only the effectively changed fields.
 */
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

/**
 * Resolve field-level conflicts using HLC timestamps.
 * For each scalar field, accept when incoming HLC > stored HLC; otherwise drop.
 * Returns accepted fields as a partial object preserving the input type.
 *
 * @param incomingFields - Scalar field values from the request
 * @param incomingTimestamps - Per-field HLC timestamps from the request
 * @param storedTimestamps - Per-field HLC timestamps from the entity's stx
 */
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
