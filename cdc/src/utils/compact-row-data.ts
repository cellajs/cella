import { entityTables, resourceTables } from '#/tables';
import { getColumns } from 'drizzle-orm';
import type { CdcRowData } from '../types';

/**
 * Columns with varchar length >= this threshold are stripped from in-memory row data.
 * The publication itself always carries all columns (column lists are incompatible with
 * REPLICA IDENTITY FULL); stripping happens in the handlers after change detection.
 * Keeps buffered/forwarded events small (e.g. ~1KB vs ~34KB for tasks) while preserving all metadata.
 * Detected automatically from Drizzle schema: no per-entity config needed.
 */
const cdcExcludeColumnLengthThreshold = 10_000;

/**
 * Set of camelCase column keys whose schema length exceeds the CDC threshold.
 * These columns carry large text (description, keywords, summary, welcomeText)
 * that the CDC pipeline never reads, only change detection needs them,
 * and that happens before compaction in the handlers.
 *
 * Built once at startup from Drizzle schema introspection.
 */
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

/**
 * Strip large columns from row data so they don't accumulate in the buffer.
 * Called in handlers after changedFields has been computed.
 */
export function compactRowData(rowData: CdcRowData): CdcRowData {
  if (excludedRowDataKeys.size === 0) return rowData;
  const slim: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rowData)) {
    if (!excludedRowDataKeys.has(key)) slim[key] = value;
  }
  return slim as CdcRowData;
}
