import type { Pgoutput } from 'pg-logical-replication';
import type { ParseMessageResult } from '../pipeline/parse-message';
import type { TableMeta } from '../types';
import { convertRowKeys, extractRowData } from '../utils';
import { compactRowData } from '../utils/compact-row-data';
import { createActivity } from '../services/create-activity';

/**
 * Handle an INSERT message and create an activity with entity data.
 */
export function handleInsert(
  tableMeta: TableMeta,
  message: Pgoutput.MessageInsert,
): ParseMessageResult {
  const rowData = convertRowKeys(extractRowData(message.new), tableMeta.columnNameMap);

  const activity = createActivity(tableMeta, rowData, 'create');

  return { activity, rowData: compactRowData(rowData), oldRowData: null, tableMeta };
}
