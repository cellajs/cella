/**
 * Detects which tracked fields have changed between current and incoming data.
 * Used by mutation layer for optimistic updates and conflict detection.
 *
 * @param current - Current entity from cache (undefined for new entities)
 * @param incoming - Incoming partial update data
 * @param trackedFields - Fields to check for changes
 * @returns Array of field names that changed
 */
export function detectChangedFields<T extends object>(
  current: T | undefined,
  incoming: Partial<T>,
  trackedFields: readonly (keyof T)[],
): (keyof T)[] {
  // New entity - no changes to detect
  if (!current) return [];

  return trackedFields.filter((field) => field in incoming && incoming[field] !== current[field]);
}
