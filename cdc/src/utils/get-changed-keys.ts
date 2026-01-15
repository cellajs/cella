import type { RowData } from './convert-row-keys';
import { snakeToCamel } from './snake-to-camel';

/**
 * Compute which keys changed between old and new row data.
 */
export function getChangedKeys(oldRow: RowData, newRow: RowData): string[] {
  const changedKeys: string[] = [];

  for (const key of Object.keys(newRow)) {
    // Skip timestamp columns that always change
    if (key === 'modifiedAt' || key === 'modified_at') continue;

    const oldValue = oldRow[key];
    const newValue = newRow[key];

    // Compare as JSON strings to handle objects/arrays
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changedKeys.push(snakeToCamel(key));
    }
  }

  return changedKeys;
}
