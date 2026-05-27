import type { CdcRowData, RowData } from '../types';
import { snakeToCamel } from './snake-to-camel';

export type { CdcRowData, RowData };

/**
 * Convert row data keys from snake_case to camelCase.
 * When columnNameMap is provided, uses O(1) lookup instead of regex conversion.
 */
export function convertRowKeys(row: RowData, columnNameMap?: Map<string, string>): CdcRowData {
  const result: RowData = {};
  for (const [key, value] of Object.entries(row)) {
    result[columnNameMap?.get(key) ?? snakeToCamel(key)] = value;
  }
  if (typeof result.id !== 'string') throw new Error(`convertRowKeys: row missing "id" field`);
  return result as CdcRowData;
}
