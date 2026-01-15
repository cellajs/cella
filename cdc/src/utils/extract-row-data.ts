import type { Pgoutput } from 'pg-logical-replication';
import type { RowData } from './convert-row-keys';

/**
 * Extract row data from pgoutput message.
 * The pgoutput plugin returns `new` and `old` as Record<string, unknown> directly.
 */
export function extractRowData(row: Pgoutput.MessageInsert['new'] | Pgoutput.MessageUpdate['old']): RowData {
  if (!row) return {};

  // If it's already an object/record, return it directly
  if (typeof row === 'object' && !Array.isArray(row)) {
    return row as RowData;
  }

  // Fallback: if it's somehow an array of columns (older format)
  if (Array.isArray(row)) {
    const result: RowData = {};
    for (const col of row as Array<{ name: string; value?: unknown }>) {
      if (col.value !== undefined) {
        result[col.name] = col.value;
      }
    }
    return result;
  }

  return {};
}
