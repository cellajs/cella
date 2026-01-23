/**
 * Detects which tracked fields have changed between current and incoming data.
 * Used by mutation layer to automatically determine changedField for sync.
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
  // New entity - no changedField needed (create uses null)
  if (!current) return [];

  return trackedFields.filter((field) => field in incoming && incoming[field] !== current[field]);
}
