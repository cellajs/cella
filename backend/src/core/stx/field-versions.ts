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

interface ResolveResult<T> {
  /** Fields that won the HLC comparison, with their values. */
  acceptedFields: Partial<T>;
  /** Field names that lost the HLC comparison. */
  dropped: string[];
}

/**
 * Resolve field-level conflicts using HLC timestamps.
 * For each scalar field, accept when incoming HLC > stored HLC; otherwise drop.
 * Returns accepted fields as a partial object (preserving the input type)
 * and dropped field names.
 *
 * @param incomingFields - Scalar field values from the request
 * @param incomingTimestamps - Per-field HLC timestamps from the request
 * @param storedTimestamps - Per-field HLC timestamps from the entity's stx
 */
export function resolveFieldConflicts<T extends Record<string, unknown>>(
  incomingFields: T,
  incomingTimestamps: Record<string, string>,
  storedTimestamps: Record<string, string>,
): ResolveResult<T> {
  const acceptedFields = {} as Partial<T>;
  const dropped: string[] = [];

  for (const field of Object.keys(incomingFields)) {
    const incomingHLC = incomingTimestamps[field];
    const storedHLC = storedTimestamps[field];

    // No stored HLC: first write, always accept.
    // No incoming HLC: not tracked (set fields), always accept.
    if (!storedHLC || !incomingHLC || compareHLC(incomingHLC, storedHLC) > 0) {
      (acceptedFields as Record<string, unknown>)[field] = incomingFields[field];
    } else {
      dropped.push(field);
    }
  }

  return { acceptedFields, dropped };
}
