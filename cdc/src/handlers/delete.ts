import type { Pgoutput } from 'pg-logical-replication';
import type { InsertActivityModel } from '#/db/schema/activities';
import { getTableName } from 'drizzle-orm';
import type { ProcessMessageResult } from '../process-message';
import type { TableRegistryEntry } from '../types';
import { actionToVerb, convertRowKeys, extractActivityContext, extractRowData, extractStxData } from '../utils';

/**
 * Handle a DELETE message and create an activity with entity data.
 */
export async function handleDelete(
  entry: TableRegistryEntry,
  message: Pgoutput.MessageDelete,
): Promise<ProcessMessageResult> {
  // For DELETE, we only have old row data (if REPLICA IDENTITY is set)
  const row = convertRowKeys(extractRowData(message.old));
  const ctx = extractActivityContext(entry, row);

  const action = 'delete';
  const entityOrResourceType = ctx.entityType ?? ctx.resourceType;
  const type = `${entityOrResourceType}.${actionToVerb(action)}`;
  const tableName = getTableName(entry.table);

  // For user deletes, the userId would reference the deleted user (from modifiedBy/createdBy/userId),
  // which no longer exists. Set to null to avoid foreign key violation.
  const userId = tableName === 'users' ? null : ctx.userId;

  // Extract stx data from realtime entities
  const stx = extractStxData(row);

  const activity: InsertActivityModel = {
    tenantId: ctx.tenantId,
    userId,
    entityType: ctx.entityType,
    resourceType: ctx.resourceType,
    action,
    tableName,
    type,
    entityId: ctx.entityId,
    organizationId: ctx.organizationId,
    changedKeys: null,
    stx,
  };

  return { activity, entityData: row, entry };
}
