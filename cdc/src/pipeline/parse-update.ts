import type { Pgoutput } from 'pg-logical-replication';
import { hierarchy, isChannel, isProduct } from 'shared';
import { isEmbeddingCleanupWrite } from '../embeddings/embedding-hooks';
import { createActivity } from '../services/create-activity';
import type { TableMeta } from '../types';
import { compactRowData } from '../utils/compact-row-data';
import { convertRowKeys } from '../utils/convert-row-keys';
import { getStxChangedFields } from '../utils/extract-stx-data';
import { getChangedFields } from '../utils/get-changed-fields';
import { pickPermissionRowData } from '../utils/permission-row-data';
import type { ParseMessageResult } from './parse-message';

/**
 * What the worker's own stamp changes (`seq`, `stx`), and the generated `path`, whose move the placement columns show.
 * None of them is a user's edit.
 */
const stampedFields = new Set(['stx', 'seq', 'path']);

/** A row's location path from its ancestor id columns; null for non-hierarchy rows. */
function rowLocationPath(entityType: string, row: Record<string, unknown>): string | null {
  if (isProduct(entityType)) return hierarchy.computeProductPath(entityType, row);
  if (isChannel(entityType)) return hierarchy.computeChannelPath(entityType, row);
  return null;
}

function isAlreadySoftDeleted(rowData: Record<string, unknown>, oldRowData: Record<string, unknown> | null): boolean {
  return oldRowData?.deletedAt != null && rowData.deletedAt != null;
}

/**
 * An update as the worker records it: the activity with the fields a user changed, and for a row that moved the
 * permission fields of the place it left.
 * @returns null for an update that changed nothing a client holds: no field, only the stamp or the path, a row that
 *   was soft-deleted already, or the worker's own cleanup of an embedding column.
 */
export function parseUpdate(tableMeta: TableMeta, message: Pgoutput.MessageUpdate): ParseMessageResult | null {
  const rowData = convertRowKeys(message.new ?? {}, tableMeta.columnNameMap);
  const oldRowData = message.old && Object.keys(message.old).length > 0 ? convertRowKeys(message.old, tableMeta.columnNameMap) : null;

  // Product updates carry changedFields in stx; everything else falls back to a WAL row diff.
  const changedFields = getStxChangedFields(rowData) ?? (oldRowData ? getChangedFields(oldRowData, rowData) : null);

  if (changedFields && changedFields.length === 0) return null;

  const userChangedFields = changedFields?.filter((field) => !stampedFields.has(field)) ?? null;

  // The worker's own seq stamp carries no user mutation.
  if (userChangedFields && userChangedFields.length === 0) return null;

  if (isAlreadySoftDeleted(rowData, oldRowData)) return null;

  // The worker's own cleanup of an embedding column carries no user mutation.
  if (isEmbeddingCleanupWrite(tableMeta.type, userChangedFields)) return null;

  const activity = createActivity(tableMeta, rowData, 'update', userChangedFields);

  // Move-out: when the location path changes, the old row's permission subset lets dispatch notify
  // subscribers who could read the old location but not the new one.
  const oldLocation = oldRowData ? rowLocationPath(tableMeta.type, oldRowData) : null;
  const newLocation = rowLocationPath(tableMeta.type, rowData);
  const movedFrom =
    oldRowData && oldLocation !== null && newLocation !== null && oldLocation !== newLocation ? pickPermissionRowData(oldRowData) : null;

  // changedFields is computed, so the large columns can go: nothing downstream reads them.
  return {
    activity,
    rowData: compactRowData(tableMeta, rowData),
    oldRowData: oldRowData ? compactRowData(tableMeta, oldRowData) : null,
    movedFrom,
    tableMeta,
  };
}
