import type { CdcRowData, RowData } from '../types';
import { snakeToCamel } from './snake-to-camel';

/**
 * A row image with the camelCase keys of its table's schema; a column the schema does not know is converted from its
 * snake_case name.
 * @param columnNameMap - The table's camelCase key per database column name (`TableMeta.columnNameMap`).
 * @throws When the row has no string `id`: every tracked table has one.
 */
export function convertRowKeys(row: RowData, columnNameMap: Map<string, string>): CdcRowData {
  const result: RowData = {};
  for (const [key, value] of Object.entries(row)) {
    result[columnNameMap.get(key) ?? snakeToCamel(key)] = value;
  }
  if (typeof result.id !== 'string') throw new Error(`convertRowKeys: row missing "id" field`);
  return result as CdcRowData;
}
