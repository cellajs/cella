import type { Pgoutput } from 'pg-logical-replication';
import type { InsertActivityModel } from '#/db/schema/activities';
import { getTableName } from 'drizzle-orm';
import type { ProcessMessageResult } from '../process-message';
import type { TableRegistryEntry } from '../types';
import { actionToVerb, convertRowKeys, extractActivityContext, extractRowData, extractStxData } from '../utils';

/**
 * Handle an INSERT message and create an activity with entity data.
 */
export function handleInsert(
  entry: TableRegistryEntry,
  message: Pgoutput.MessageInsert,
): ProcessMessageResult {
  const action = 'create';
  const row = convertRowKeys(extractRowData(message.new));
  const ctx = extractActivityContext(entry, row);

  const entityOrResourceType = ctx.entityType ?? ctx.resourceType;
  const type = `${entityOrResourceType}.${actionToVerb(action)}`;

  // Extract stx data from realtime entities
  const stx = extractStxData(row);

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
    changedKeys: null,
    stx,
  };

  return { activity, entityData: row, entry };
}
