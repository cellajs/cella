import type { Pgoutput } from 'pg-logical-replication';
import { appConfig } from 'shared';
import type { ParseMessageResult } from '../pipeline/parse-message';
import type { TableMeta } from '../types';
import { convertRowKeys, extractRowData, getChangedFields } from '../utils';
import { compactRowData } from '../utils/compact-row-data';
import { isSoftDeleteTransition } from '../utils/is-soft-delete-transition';
import { createActivity } from '../services/create-activity';

/** 
 * Columns that hold embedded entity ID arrays (e.g. task.labels).
 */
const embeddingColumns: Set<string> = new Set(appConfig.entityEmbeddings.map((e) => e.hostColumn));

/**
 * Read changedFields from stx metadata if the backend persisted it.
 * Returns null when stx doesn't contain changedFields (creates, non-API updates, old data).
 */
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

/**
 * Handle an UPDATE message and create an activity with entity data.
 */
export function handleUpdate(
  tableMeta: TableMeta,
  message: Pgoutput.MessageUpdate,
): ParseMessageResult | null {
  const oldRow = extractRowData(message.old);
  const rowData = convertRowKeys(extractRowData(message.new), tableMeta.columnNameMap);
  const hasOldRow = oldRow && Object.keys(oldRow).length > 0;
  const oldRowData = hasOldRow ? convertRowKeys(oldRow, tableMeta.columnNameMap) : null;

  // Product entity updates have changedFields in stx (set by buildStx in the sync engine).
  // Other entities/resources (users, orgs, memberships, etc.) lack stx: fall back to WAL row diff.
  const changedFields = getStxChangedFields(rowData) ?? (oldRowData ? getChangedFields(oldRowData, rowData) : null);

  // Skip if nothing meaningful changed
  if (changedFields && changedFields.length === 0) return null;

  // Strip sync-state fields: they always change on every write but aren't user mutations.
  // Must happen before embedding suppression so WAL-diff paths don't see 'stx'/'seq'.
  const syncStateKeys = new Set(['stx', 'seq']);
  const userChangedFields = changedFields?.filter((k) => !syncStateKeys.has(k)) ?? null;

  // Skip CDC's own seq stamps (only seq/stx changed, no user mutation)
  if (userChangedFields && userChangedFields.length === 0) return null;

  if (!isSoftDeleteTransition(rowData, oldRowData) && isAlreadySoftDeleted(rowData, oldRowData)) return null;

  // Skip CDC-driven embedding cleanup (e.g. label array stripped after label delete): user edits always include 'updatedAt' in stx.changedFields, so a change touching only embedding columns is cleanup, not a user mutation.
  if (userChangedFields && !userChangedFields.includes('updatedAt') && userChangedFields.every((k) => embeddingColumns.has(k))) {
    return null;
  }

  const activity = createActivity(tableMeta, rowData, 'update', { changedFields: userChangedFields });

  // Strip large columns: changedFields already computed, downstream never reads content
  return { activity, rowData: compactRowData(rowData), oldRowData: oldRowData ? compactRowData(oldRowData) : null, tableMeta };
}
