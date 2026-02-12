import type { Pgoutput } from 'pg-logical-replication';
import { getTableName } from 'drizzle-orm';
import type { ProcessMessageResult } from '../process-message';
import type { TableRegistryEntry } from '../types';
import { convertRowKeys, extractRowData } from '../utils';
import { buildActivity } from './build-activity';

/**
 * Handle a DELETE message and create an activity with entity data.
 */
export function handleDelete(
  entry: TableRegistryEntry,
  message: Pgoutput.MessageDelete,
): ProcessMessageResult {
  // For DELETE, we only have old row data (if REPLICA IDENTITY is set)
  const row = convertRowKeys(extractRowData(message.old));
  const tableName = getTableName(entry.table);

  // For user deletes, the userId would reference the deleted user (from modifiedBy/createdBy/userId),
  // which no longer exists. Set to null to avoid foreign key violation.
  const userId = tableName === 'users' ? null : undefined;

  const activity = buildActivity(entry, row, 'delete', userId !== undefined ? { userId } : undefined);

  return { activity, entityData: row, entry };
}
