import type { RowData } from '../types';

/** The columns whose value differs between two images of a row. Expects camelCase keys, so run convertRowKeys first. */
export function getChangedFields(oldRow: RowData, newRow: RowData): string[] {
  const changedFields: string[] = [];

  for (const key of Object.keys(newRow)) {
    const oldValue = oldRow[key];
    const newValue = newRow[key];

    // JSON comparison covers objects and arrays.
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changedFields.push(key);
    }
  }

  return changedFields;
}
