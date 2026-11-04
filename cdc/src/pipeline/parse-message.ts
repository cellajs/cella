import type { Pgoutput } from 'pg-logical-replication';
import type { ChannelIdColumns } from 'shared';
import type { PermissionRowData } from 'shared/permissions/permission-row-data';
import type { ActivityModel } from '#/modules/activities/activities-db';
import { createActivity } from '../services/create-activity';
import { tableRegistry } from '../table-registry';
import type { CdcRowData, RowData, TableMeta } from '../types';
import { compactRowData } from '../utils/compact-row-data';
import { convertRowKeys } from '../utils/convert-row-keys';
import { parseUpdate } from './parse-update';

/** A change of a row, the one kind of message the parser reads. */
export type DmlMessage = Pgoutput.MessageInsert | Pgoutput.MessageUpdate | Pgoutput.MessageDelete;

/**
 * An activity before it has its id, which a flush derives from the commit position of its source transaction. It names
 * every channel the hierarchy declares, also one whose id the activities table holds no column for.
 */
export type CdcActivity = Omit<ActivityModel, 'id'> & ChannelIdColumns;

/** A change as the parser hands it on: its activity, its row and, for an update, the row as it was. */
export interface ParseMessageResult {
  activity: CdcActivity;
  rowData: CdcRowData;
  oldRowData: CdcRowData | null;
  /** For a row that moved: the permission fields of the place it left, so dispatch can drop subscribers who lost access. */
  movedFrom?: PermissionRowData | null;
  tableMeta: TableMeta;
}

/** A create or a delete: the whole row is the change. An insert carries the new row, a delete the row as it was. */
function parseWholeRow(tableMeta: TableMeta, row: RowData | null, action: 'create' | 'delete'): ParseMessageResult {
  const rowData = convertRowKeys(row ?? {}, tableMeta.columnNameMap);
  return { activity: createActivity(tableMeta, rowData, action), rowData: compactRowData(tableMeta, rowData), oldRowData: null, tableMeta };
}

/**
 * The change a row message describes, as the worker records it.
 * @returns null for an untracked table, the removal of a tombstone and an update that changed nothing a client holds.
 */
export function parseMessage(message: DmlMessage): ParseMessageResult | null {
  const tableMeta = tableRegistry.get(message.relation.name);
  if (!tableMeta) return null;

  switch (message.tag) {
    case 'insert':
      return parseWholeRow(tableMeta, message.new, 'create');
    case 'update':
      return parseUpdate(tableMeta, message);
    case 'delete': {
      // The removal of a tombstone (apply_retention()) changes nothing a client holds: the delete reached everyone as
      // the tombstone, and the counters never counted it.
      const removed = parseWholeRow(tableMeta, message.old, 'delete');
      return removed.rowData.deletedAt == null ? removed : null;
    }
  }
}
