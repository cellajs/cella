import type { Pgoutput } from 'pg-logical-replication';
import type { RowData } from '../types';

/**
 * Extract row data from pgoutput message.
 * The pgoutput plugin returns `new` and `old` as Record<string, unknown> directly.
 */
export function extractRowData(row: Pgoutput.MessageInsert['new'] | Pgoutput.MessageUpdate['old']): RowData {
  if (!row) return {};
  return row as RowData;
}
