import type { Pgoutput } from 'pg-logical-replication';
import { appConfig, hierarchy, isChannel, isProduct } from 'shared';
import type { ParseMessageResult } from '../pipeline/parse-message';
import { createActivity } from '../services/create-activity';
import type { TableMeta } from '../types';
import { convertRowKeys, extractRowData, getChangedFields } from '../utils';
import { compactRowData } from '../utils/compact-row-data';
import { isSoftDeleteTransition } from '../utils/is-soft-delete-transition';
import { pickPermissionRowData } from '../utils/permission-row-data';

/** Columns holding embedded entity id arrays, e.g. `task.labels`. */
const embeddingColumns: Set<string> = new Set(appConfig.productEmbeddings.map((e) => e.hostColumn));

/** A row's location path from its ancestor id columns; null for non-hierarchy rows. */
const rowLocationPath = (entityType: string, row: Record<string, unknown>): string | null => {
  if (isProduct(entityType)) return hierarchy.computeProductPath(entityType, row);
  if (isChannel(entityType)) return hierarchy.computeChannelPath(entityType, row);
  return null;
};

/** @returns null when stx carries no changedFields: creates, non-API updates, rows written before stx. */
function getStxChangedFields(row: Record<string, unknown>): string[] | null {
  const stx = row.stx;
  if (stx && typeof stx === 'object' && !Array.isArray(stx)) {
    const cf = (stx as Record<string, unknown>).changedFields;
    if (Array.isArray(cf)) return cf.filter((x): x is string => typeof x === 'string');
  }
  return null;
}

function isAlreadySoftDeleted(rowData: Record<string, unknown>, oldRowData: Record<string, unknown> | null): boolean {
  return oldRowData?.deletedAt != null && rowData.deletedAt != null;
}

export function handleUpdate(tableMeta: TableMeta, message: Pgoutput.MessageUpdate): ParseMessageResult | null {
  const oldRow = extractRowData(message.old);
  const rowData = convertRowKeys(extractRowData(message.new), tableMeta.columnNameMap);
  const hasOldRow = oldRow && Object.keys(oldRow).length > 0;
  const oldRowData = hasOldRow ? convertRowKeys(oldRow, tableMeta.columnNameMap) : null;

  // Product updates carry changedFields in stx; everything else falls back to a WAL row diff.
  const changedFields = getStxChangedFields(rowData) ?? (oldRowData ? getChangedFields(oldRowData, rowData) : null);

  if (changedFields && changedFields.length === 0) return null;

  // Drop sync and generated path echoes; placement columns still carry the user-visible move.
  const syncStateKeys = new Set(['stx', 'seq', 'path']);
  const userChangedFields = changedFields?.filter((k) => !syncStateKeys.has(k)) ?? null;

  // CDC's own seq stamps carry no user mutation.
  if (userChangedFields && userChangedFields.length === 0) return null;

  if (!isSoftDeleteTransition(rowData, oldRowData) && isAlreadySoftDeleted(rowData, oldRowData)) return null;

  // User edits always include 'updatedAt', so an embedding-column-only change is CDC's own cleanup.
  if (
    userChangedFields &&
    !userChangedFields.includes('updatedAt') &&
    userChangedFields.every((k) => embeddingColumns.has(k))
  ) {
    return null;
  }

  const activity = createActivity(tableMeta, rowData, 'update', { changedFields: userChangedFields });

  // Move-out: when the location path changes, the old row's permission subset lets dispatch notify
  // subscribers who could read the old location but not the new one.
  const oldLocation = oldRowData ? rowLocationPath(tableMeta.type, oldRowData) : null;
  const newLocation = rowLocationPath(tableMeta.type, rowData);
  const movedFrom =
    oldRowData && oldLocation !== null && newLocation !== null && oldLocation !== newLocation
      ? pickPermissionRowData(oldRowData)
      : null;

  // changedFields is computed, so the large columns can go: nothing downstream reads them.
  return {
    activity,
    rowData: compactRowData(rowData),
    oldRowData: oldRowData ? compactRowData(oldRowData) : null,
    movedFrom,
    tableMeta,
  };
}
