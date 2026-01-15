import type { RowData } from './convert-row-keys';
import { snakeToCamel } from './snake-to-camel';

/**
 * Get a value from row data, checking both camelCase and snake_case.
 */
export function getRowValue(row: RowData, columnName: string | null): string | null {
  if (!columnName) return null;

  // Try camelCase first, then snake_case
  const camelKey = snakeToCamel(columnName);
  const value = row[camelKey] ?? row[columnName];

  return typeof value === 'string' ? value : null;
}
