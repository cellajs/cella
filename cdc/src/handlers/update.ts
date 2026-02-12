import type { Pgoutput } from 'pg-logical-replication';
import type { ProcessMessageResult } from '../process-message';
import type { TableRegistryEntry } from '../types';
import { convertRowKeys, extractRowData, getChangedKeys } from '../utils';
import { buildActivity } from './build-activity';

/**
 * Handle an UPDATE message and create an activity with entity data.
 */
export function handleUpdate(
  entry: TableRegistryEntry,
  message: Pgoutput.MessageUpdate,
): ProcessMessageResult | null {
  const oldRow = convertRowKeys(extractRowData(message.old));
  const newRow = convertRowKeys(extractRowData(message.new));

  // If no old row data, REPLICA IDENTITY might not be FULL
  const changedKeys = Object.keys(oldRow).length > 0 ? getChangedKeys(oldRow, newRow) : null;

  // Skip if nothing meaningful changed
  if (changedKeys && changedKeys.length === 0) return null;

  const activity = buildActivity(entry, newRow, 'update', { changedKeys });

  return { activity, entityData: newRow, entry };
}
