import type { RowData } from './convert-row-keys';

/**
 * Compute which fields changed between old and new row data.
 * Expects rows with camelCase keys (already processed by convertRowKeys).
 */
export function getChangedFields(oldRow: RowData, newRow: RowData): string[] {
  const changedFields: string[] = [];

  for (const key of Object.keys(newRow)) {
    // Skip timestamp columns that always change
    if (key === 'updatedAt') continue;

    const oldValue = oldRow[key];
    const newValue = newRow[key];

    // Compare as JSON strings to handle objects/arrays
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changedFields.push(key);
    }
  }

  return changedFields;
}
