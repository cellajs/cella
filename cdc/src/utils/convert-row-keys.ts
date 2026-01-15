import { snakeToCamel } from './snake-to-camel';

/** Row data from pgoutput message */
export type RowData = Record<string, unknown>;

/**
 * Convert row data keys from snake_case to camelCase.
 */
export function convertRowKeys(row: RowData): RowData {
  const result: RowData = {};
  for (const [key, value] of Object.entries(row)) {
    result[snakeToCamel(key)] = value;
  }
  return result;
}
