import { getColumns } from 'drizzle-orm';
import { entityTables, resourceTables } from '#/tables';
import type { CdcRowData } from '../types';

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

/** Called in the handlers, after changedFields has been computed. */
export function compactRowData(rowData: CdcRowData): CdcRowData {
  if (excludedRowDataKeys.size === 0) return rowData;
  const slim: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rowData)) {
    if (!excludedRowDataKeys.has(key)) slim[key] = value;
  }
  return slim as CdcRowData;
}
