import type { Pgoutput } from 'pg-logical-replication';
import type { InsertActivityModel } from '#/modules/activities/activities-db';
import { handleDelete, handleInsert, handleUpdate } from '../handlers';
import type { CdcRowData } from '../types';
import type { TableMeta } from '../types';
import { tableRegistry } from '../table-registry';

/** Activity without id, assigned later from WAL LSN in prepareActivity. */
export type ActivityWithoutId = Omit<InsertActivityModel, 'id'>;

/**
 * Result of parsing a CDC message.
 * Includes activity to insert, row data (entity or resource) and table metadata.
 * `movedFrom` is set on product updates whose materialized `path` changed (reparent):
 * the permission-relevant subset of the OLD row, so dispatch can deliver a move-out
 * to subscribers who could read the old location but not the new one.
 */
export interface ParseMessageResult {
  activity: ActivityWithoutId;
  rowData: CdcRowData;
  oldRowData: CdcRowData | null;
  movedFrom?: CdcRowData | null;
  tableMeta: TableMeta;
}

/**
 * Parse a pgoutput message and return activity + row data for tracked tables.
 */
export function parseMessage(message: Pgoutput.Message): ParseMessageResult | null {
  // Only process DML messages with a relation
  const { tag } = message;
  if (tag !== 'insert' && tag !== 'update' && tag !== 'delete') {
    return null;
  }

  // Skip untracked tables
  const tableMeta = tableRegistry.get(message.relation.name);
  if (!tableMeta) return null;

  // Dispatch to handlers
  switch (tag) {
    case 'insert':
      return handleInsert(tableMeta, message);
    case 'update':
      return handleUpdate(tableMeta, message);
    case 'delete':
      return handleDelete(tableMeta, message);
  }
}

