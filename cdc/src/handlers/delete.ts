import type { Pgoutput } from 'pg-logical-replication';
import type { ParseMessageResult } from '../pipeline/parse-message';
import type { TableMeta } from '../types';
import { convertRowKeys, extractRowData } from '../utils';
import { compactRowData } from '../utils/compact-row-data';
import { createActivity } from '../services/create-activity';

/**
 * Handle a DELETE message and create an activity with entity data.
 */
export function handleDelete(
  tableMeta: TableMeta,
  message: Pgoutput.MessageDelete,
): ParseMessageResult {
  // For deletes, the pre-deletion snapshot from message.old is used as rowData
  // (there is no "new" state). oldRowData is null since diffs don't apply.
  const rowData = convertRowKeys(extractRowData(message.old), tableMeta.columnNameMap);

  const activity = createActivity(tableMeta, rowData, 'delete');

  return { activity, rowData: compactRowData(rowData), oldRowData: null, tableMeta };
}
