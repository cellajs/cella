import type { RowData } from '../types';

/** A column of a row whose keys are camelCase already, when it holds a string; null otherwise. */
export function getStringValue(row: RowData, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' ? value : null;
}
