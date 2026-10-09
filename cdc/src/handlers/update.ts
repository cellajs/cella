import type { Pgoutput } from 'pg-logical-replication';
import { hierarchy, isChannel, isProduct } from 'shared';
import { isEmbeddingCleanupWrite } from '../embeddings';
import type { ParseMessageResult } from '../pipeline/parse-message';
import { createActivity } from '../services/create-activity';
import type { TableMeta } from '../types';
import { compactRowData } from '../utils/compact-row-data';
import { convertRowKeys } from '../utils/convert-row-keys';
import { getChangedFields } from '../utils/get-changed-fields';
import { isSoftDeleteTransition } from '../utils/is-soft-delete-transition';
import { pickPermissionRowData } from '../utils/permission-row-data';

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
  const rowData = convertRowKeys(message.new ?? {}, tableMeta.columnNameMap);
  const oldRowData = message.old && Object.keys(message.old).length > 0 ? convertRowKeys(message.old, tableMeta.columnNameMap) : null;

  // Product updates carry changedFields in stx; everything else falls back to a WAL row diff.
  const changedFields = getStxChangedFields(rowData) ?? (oldRowData ? getChangedFields(oldRowData, rowData) : null);

  if (changedFields && changedFields.length === 0) return null;

  // Drop sync and generated path echoes; placement columns still carry the user-visible move.
  const syncStateKeys = new Set(['stx', 'seq', 'path']);
  const userChangedFields = changedFields?.filter((k) => !syncStateKeys.has(k)) ?? null;

  // CDC's own seq stamps carry no user mutation.
  if (userChangedFields && userChangedFields.length === 0) return null;

  if (!isSoftDeleteTransition(rowData, oldRowData) && isAlreadySoftDeleted(rowData, oldRowData)) return null;

  // CDC's own cleanup of an embedding column carries no user mutation.
  if (isEmbeddingCleanupWrite(tableMeta.type, userChangedFields)) return null;

  const activity = createActivity(tableMeta, rowData, 'update', { changedFields: userChangedFields });

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
