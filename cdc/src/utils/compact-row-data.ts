import type { CdcRowData, TableMeta } from '../types';

/**
 * Called by the parser, after changedFields has been computed: drops the table's stripped keys (large-text and secret
 * columns), so neither crosses to the backend.
 */
export function compactRowData(tableMeta: TableMeta, rowData: CdcRowData): CdcRowData {
  const { strippedKeys } = tableMeta;
  if (strippedKeys.size === 0) return rowData;
  const slim: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rowData)) {
    if (!strippedKeys.has(key)) slim[key] = value;
  }
  return { ...slim, id: rowData.id };
}
