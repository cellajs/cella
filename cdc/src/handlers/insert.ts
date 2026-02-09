import type { Pgoutput } from 'pg-logical-replication';
import type { InsertActivityModel } from '#/db/schema/activities';
import { getTableName } from 'drizzle-orm';
import type { ProcessMessageResult } from '../process-message';
import type { TableRegistryEntry } from '../types';
import { actionToVerb, convertRowKeys, extractActivityContext, extractRowData, extractTxData } from '../utils';

/**
 * Handle an INSERT message and create an activity with entity data.
 */
export async function handleInsert(
  entry: TableRegistryEntry,
  message: Pgoutput.MessageInsert,
): Promise<ProcessMessageResult> {
  const action = 'create';
  const row = convertRowKeys(extractRowData(message.new));
  const ctx = extractActivityContext(entry, row);

  const entityOrResourceType = ctx.entityType ?? ctx.resourceType;
  const type = `${entityOrResourceType}.${actionToVerb(action)}`;

  // Extract tx data from realtime entities
  const tx = extractTxData(row);

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
    changedKeys: null,
    tx,
  };

  return { activity, entityData: row, entry };
}
