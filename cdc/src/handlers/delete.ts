import type { Pgoutput } from 'pg-logical-replication';
import type { InsertActivityModel } from '#/db/schema/activities';
import { getTableName } from 'drizzle-orm';
import type { ProcessMessageResult } from '../process-message';
import type { TableRegistryEntry } from '../types';
import { actionToVerb, convertRowKeys, extractActivityContext, extractRowData, extractStxData } from '../utils';

/**
 * Handle a DELETE message and create an activity with entity data.
 */
export function handleDelete(
  entry: TableRegistryEntry,
  message: Pgoutput.MessageDelete,
): ProcessMessageResult {
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

  // Destructure known fields; remaining are dynamic context entity IDs (organizationId, projectId, etc.)
  const { entityId, userId: _userId, tenantId, entityType, resourceType, ...contextEntityIds } = ctx;

  const activity: InsertActivityModel = {
    tenantId,
    userId,
    entityType,
    resourceType,
    action,
    tableName,
    type,
    entityId,
    ...contextEntityIds,
    changedKeys: null,
    stx,
  };

  return { activity, entityData: row, entry };
}
