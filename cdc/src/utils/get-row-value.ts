import type { RowData } from './convert-row-keys';
import { snakeToCamel } from './snake-to-camel';

/** Checks both camelCase and snake_case keys. */
export function getRowValue(row: RowData, columnName: string | null): string | null {
  if (!columnName) return null;

  const camelKey = snakeToCamel(columnName);
  const value = row[camelKey] ?? row[columnName];

  return typeof value === 'string' ? value : null;
}
