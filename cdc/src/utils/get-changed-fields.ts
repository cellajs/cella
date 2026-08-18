import type { RowData } from '../types';

/** Expects camelCase keys, so run convertRowKeys first. */
export function getChangedFields(oldRow: RowData, newRow: RowData): string[] {
  const changedFields: string[] = [];

  for (const key of Object.keys(newRow)) {
    // These always change.
    if (key === 'updatedAt') continue;

    const oldValue = oldRow[key];
    const newValue = newRow[key];

    // JSON comparison covers objects and arrays.
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changedFields.push(key);
    }
  }

  return changedFields;
}
