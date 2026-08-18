import type { Pgoutput } from 'pg-logical-replication';
import type { ParseMessageResult } from '../pipeline/parse-message';
import { createActivity } from '../services/create-activity';
import type { TableMeta } from '../types';
import { convertRowKeys, extractRowData } from '../utils';
import { compactRowData } from '../utils/compact-row-data';

export function handleDelete(tableMeta: TableMeta, message: Pgoutput.MessageDelete): ParseMessageResult {
  // The pre-deletion snapshot from message.old becomes rowData; oldRowData stays null.
  const rowData = convertRowKeys(extractRowData(message.old), tableMeta.columnNameMap);

  const activity = createActivity(tableMeta, rowData, 'delete');

  return { activity, rowData: compactRowData(rowData), oldRowData: null, tableMeta };
}
