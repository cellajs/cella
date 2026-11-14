import type { Pgoutput } from 'pg-logical-replication';
import { hierarchy, isChannel, isProduct } from 'shared';
import { isReferenceStripWrite } from '../embeddings/embedding-strip';
import { createActivity } from '../services/create-activity';
import type { TableMeta } from '../types';
import { compactRowData } from '../utils/compact-row-data';
import { convertRowKeys } from '../utils/convert-row-keys';
import { getChangedFields } from '../utils/get-changed-fields';
import { isTombstone } from '../utils/is-tombstone';
import { pickPermissionRowData } from '../utils/permission-row-data';
import type { ParseMessageResult } from './parse-message';

/**
 * Columns the diff leaves out: `seq` is the worker's own stamp, `stx` is rewritten by every write and by the worker's reference strip
 * (which `isReferenceStripWrite` relies on), and the generated `path` moves with the placement columns. None is a user's edit.
 */
const stampedFields = new Set(['stx', 'seq', 'path']);

/** A row's location path from its ancestor id columns; null for non-hierarchy rows. */
function rowLocationPath(entityType: string, row: Record<string, unknown>): string | null {
  if (isProduct(entityType)) return hierarchy.computeProductPath(entityType, row);
  if (isChannel(entityType)) return hierarchy.computeChannelPath(entityType, row);
  return null;
}

/**
 * An update as the worker records it: the activity with the fields that differ between the old and the new row, and
 * for a row that left readers behind, by a move or by `public` going false, the permission fields it had. A product's
 * soft delete is recorded as a `delete` carrying the tombstone, with the row before it as `oldRowData`.
 * @returns null for an update that changed nothing a client holds: no field, only the stamp, the path or `updatedAt`,
 *   a row that was soft-deleted already, or the worker's own strip of an embedding column.
 * @throws When the update carries no old row, which a table with REPLICA IDENTITY FULL always sends.
 */
export function parseUpdate(tableMeta: TableMeta, message: Pgoutput.MessageUpdate): ParseMessageResult | null {
  if (!message.old) throw new Error(`An update of ${message.relation.name} carries no old row: the table needs REPLICA IDENTITY FULL`);
  const rowData = convertRowKeys(message.new, tableMeta.columnNameMap);
  const oldRowData = convertRowKeys(message.old, tableMeta.columnNameMap);

  const changedFields = getChangedFields(oldRowData, rowData).filter((field) => !stampedFields.has(field));

  // A write that changes no field still moves updatedAt.
  if (changedFields.every((field) => field === 'updatedAt')) return null;

  if (isTombstone(oldRowData) && isTombstone(rowData)) return null;

  if (isTombstone(rowData) && isProduct(tableMeta.type)) {
    const activity = createActivity(tableMeta, rowData, 'delete');
    return { activity, rowData: compactRowData(tableMeta, rowData), oldRowData: compactRowData(tableMeta, oldRowData), movedFrom: null, tableMeta };
  }

  // The worker's own strip of an embedding column carries no user mutation.
  if (isReferenceStripWrite(tableMeta.type, changedFields)) return null;

  const activity = createActivity(tableMeta, rowData, 'update', changedFields);

  // Move-out: when the location path changes, or `public` goes false and takes the row from readers who had it through
  // the flag alone, the old row's permission subset lets dispatch tell subscribers who could read it and cannot now.
  const oldLocation = rowLocationPath(tableMeta.type, oldRowData);
  const newLocation = rowLocationPath(tableMeta.type, rowData);
  const moved = oldLocation !== null && newLocation !== null && oldLocation !== newLocation;
  const lostPublic = oldRowData.public === true && rowData.public === false;
  const movedFrom = moved || lostPublic ? pickPermissionRowData(oldRowData) : null;

  // changedFields is computed, so the large columns can go: nothing downstream reads them.
  return {
    activity,
    rowData: compactRowData(tableMeta, rowData),
    oldRowData: compactRowData(tableMeta, oldRowData),
    movedFrom,
    tableMeta,
  };
}
