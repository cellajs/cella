import type { Pgoutput } from 'pg-logical-replication';
import type { InsertActivityModel } from '#/db/schema/activities';
import { getTableName } from 'drizzle-orm';
import type { ProcessMessageResult } from '../process-message';
import type { TableRegistryEntry } from '../types';
import { actionToVerb, convertRowKeys, extractActivityContext, extractRowData, extractStxData, getChangedKeys } from '../utils';

/**
 * Handle an UPDATE message and create an activity with entity data.
 */
export async function handleUpdate(
  entry: TableRegistryEntry,
  message: Pgoutput.MessageUpdate,
): Promise<ProcessMessageResult | null> {
  const oldRow = convertRowKeys(extractRowData(message.old));
  const newRow = convertRowKeys(extractRowData(message.new));

  // If no old row data, REPLICA IDENTITY might not be FULL
  const changedKeys = Object.keys(oldRow).length > 0 ? getChangedKeys(oldRow, newRow) : null;

  // Skip if nothing meaningful changed
  if (changedKeys && changedKeys.length === 0) return null;

  const action = 'update';
  const ctx = extractActivityContext(entry, newRow);

  const entityOrResourceType = ctx.entityType ?? ctx.resourceType;
  const type = `${entityOrResourceType}.${actionToVerb(action)}`;

  // Extract stx data from realtime entities
  const stx = extractStxData(newRow);

  const activity: InsertActivityModel = {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    entityType: ctx.entityType,
    resourceType: ctx.resourceType,
    action,
    tableName: getTableName(entry.table),
    type,
    entityId: ctx.entityId,
    organizationId: ctx.organizationId,
    changedKeys,
    stx,
  };

  return { activity, entityData: newRow, entry };
}
