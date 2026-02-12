import type { Pgoutput } from 'pg-logical-replication';
import type { ProcessMessageResult } from '../process-message';
import type { TableRegistryEntry } from '../types';
import { convertRowKeys, extractRowData } from '../utils';
import { buildActivity } from './build-activity';

/**
 * Handle an INSERT message and create an activity with entity data.
 */
export function handleInsert(
  entry: TableRegistryEntry,
  message: Pgoutput.MessageInsert,
): ProcessMessageResult {
  const row = convertRowKeys(extractRowData(message.new));
  const activity = buildActivity(entry, row, 'create');

  return { activity, entityData: row, entry };
}
