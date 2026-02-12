import type { Pgoutput } from 'pg-logical-replication';
import type { InsertActivityModel } from '#/db/schema/activities';
import { getTableName } from 'drizzle-orm';
import type { ProcessMessageResult } from '../process-message';
import type { TableRegistryEntry } from '../types';
import { actionToVerb, convertRowKeys, extractActivityContext, extractRowData, extractStxData, getChangedKeys } from '../utils';

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

  const action = 'update';
  const ctx = extractActivityContext(entry, newRow);

  const entityOrResourceType = ctx.entityType ?? ctx.resourceType;
  const type = `${entityOrResourceType}.${actionToVerb(action)}`;

  // Extract stx data from realtime entities
  const stx = extractStxData(newRow);

  // Destructure known fields; remaining are dynamic context entity IDs (organizationId, projectId, etc.)
  const { entityId, userId, tenantId, entityType, resourceType, ...contextEntityIds } = ctx;

  const activity: InsertActivityModel = {
    tenantId,
    userId,
    entityType,
    resourceType,
    action,
    tableName: getTableName(entry.table),
    type,
    entityId,
    ...contextEntityIds,
    changedKeys,
    stx,
  };

  return { activity, entityData: newRow, oldEntityData: Object.keys(oldRow).length > 0 ? oldRow : undefined, entry };
}
