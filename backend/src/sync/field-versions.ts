/**
 * HLC-based field conflict resolution for sync engine.
 * Replaces version-based conflict detection with per-field HLC timestamps.
 * Newer HLC wins, older silently dropped — no 409, no retry.
 */

import { compareHLC } from './hlc';

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * Filter out primitive fields where the incoming value is identical to the current entity value.
 * Non-primitive fields (arrays, objects) are always kept — no deep equality.
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

interface ResolveResult {
  /** Field names that won the HLC comparison (newer timestamp) */
  accepted: string[];
  /** Field names that lost the HLC comparison (older timestamp) */
  dropped: string[];
}

/**
 * Resolve field-level conflicts using HLC timestamps.
 * For each scalar field: incoming HLC > stored HLC → accept, otherwise drop.
 *
 * @param incomingFields - Scalar field values from the request
 * @param incomingTimestamps - Per-field HLC timestamps from the request
 * @param storedTimestamps - Per-field HLC timestamps from the entity's stx
 */
export function resolveFieldConflicts(
  incomingFields: Record<string, unknown>,
  incomingTimestamps: Record<string, string>,
  storedTimestamps: Record<string, string>,
): ResolveResult {
  const accepted: string[] = [];
  const dropped: string[] = [];

  for (const field of Object.keys(incomingFields)) {
    const incomingHLC = incomingTimestamps[field];
    const storedHLC = storedTimestamps[field];

    // No stored HLC → first write, always accept
    // No incoming HLC → not tracked (set fields), always accept
    if (!storedHLC || !incomingHLC || compareHLC(incomingHLC, storedHLC) > 0) {
      accepted.push(field);
    } else {
      dropped.push(field);
    }
  }

  return { accepted, dropped };
}
