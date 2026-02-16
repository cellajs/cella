import type { RowData } from './convert-row-keys';

/**
 * Compute which keys changed between old and new row data.
 * Expects rows with camelCase keys (already processed by convertRowKeys).
 */
export function getChangedKeys(oldRow: RowData, newRow: RowData): string[] {
  const changedKeys: string[] = [];

  for (const key of Object.keys(newRow)) {
    // Skip timestamp columns that always change
    if (key === 'modifiedAt') continue;

    const oldValue = oldRow[key];
    const newValue = newRow[key];

    // Compare as JSON strings to handle objects/arrays
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changedKeys.push(key);
    }
  }

  return changedKeys;
}
