import { getColumns, getTableName } from 'drizzle-orm';
import { secretColumnsOf } from '#/db/secret-columns';
import { entityTables, resourceTables } from '#/tables';
import type { CdcRowData, TableMeta } from '../types';

/**
 * Varchar length at or above which a column is stripped from in-memory row data. The publication
 * always carries every column, since column lists are incompatible with REPLICA IDENTITY FULL, so
 * stripping happens in the handlers after change detection.
 */
const cdcExcludeColumnLengthThreshold = 10_000;

/** camelCase keys of large-text columns, from Drizzle introspection at startup. */
export const excludedRowDataKeys: Set<string> = (() => {
  const keys = new Set<string>();
  const allTables = [...Object.values(entityTables), ...Object.values(resourceTables)];
  for (const table of allTables) {
    for (const [key, col] of Object.entries(getColumns(table))) {
      const len = (col as unknown as { length: number | undefined }).length;
      if (len !== undefined && len >= cdcExcludeColumnLengthThreshold) keys.add(key);
    }
  }
  return keys;
})();

/** Secret columns per tracked table (`secretColumns` in backend/src/db/secret-columns.ts), stripped whatever their length. */
const secretKeysByTable: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  [...Object.values(entityTables), ...Object.values(resourceTables)].map((table) => {
    const name = getTableName(table);
    return [name, new Set(secretColumnsOf(name))];
  }),
);

/**
 * Called in the handlers, after changedFields has been computed: drops large-text columns and the
 * table's secret columns, so neither crosses to the backend.
 */
export function compactRowData(tableMeta: TableMeta, rowData: CdcRowData): CdcRowData {
  const secret = secretKeysByTable.get(getTableName(tableMeta.table));
  if (excludedRowDataKeys.size === 0 && !secret?.size) return rowData;
  const slim: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rowData)) {
    if (!excludedRowDataKeys.has(key) && !secret?.has(key)) slim[key] = value;
  }
  return slim as CdcRowData;
}
