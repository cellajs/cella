import type { Pgoutput } from 'pg-logical-replication';
import type { InsertActivityModel } from '#/db/schema/activities';
import { getTableName } from 'drizzle-orm';
import { enrichMembershipData } from '../enrichment';
import type { ProcessMessageResult } from '../process-message';
import type { TableRegistryEntry } from '../types';
import { actionToVerb, convertRowKeys, extractActivityContext, extractRowData, extractTxData } from '../utils';

/**
 * Handle a DELETE message and create an activity with entity data.
 * For membership deletes, enriches with user and entity info (entities still exist).
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

  // Extract tx data from realtime entities
  const tx = extractTxData(row);

  // Enrich membership data with user and entity info
  // Note: For deletes, the user and entity still exist - only the membership is deleted
  let enrichedData: Record<string, unknown> = row;
  if (entry.kind === 'resource' && entry.type === 'membership') {
    const enrichment = await enrichMembershipData(row);
    enrichedData = { ...row, ...enrichment };
  }

  const activity: InsertActivityModel = {
    userId,
    entityType: ctx.entityType,
    resourceType: ctx.resourceType,
    action,
    tableName,
    type,
    entityId: ctx.entityId,
    organizationId: ctx.organizationId,
    changedKeys: null,
    tx,
  };

  return { activity, entityData: enrichedData, entry };
}
