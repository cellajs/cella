import type { Pgoutput } from 'pg-logical-replication';
import type { InsertActivityModel } from '#/db/schema/activities';
import { nanoid } from '#/utils/nanoid';
import { getTableName } from 'drizzle-orm';
import type { TableRegistryEntry } from '../types';
import { actionToVerb, convertRowKeys, extractActivityContext, extractRowData } from '../utils';

/**
 * Handle an INSERT message and create an activity.
 */
export function handleInsert(entry: TableRegistryEntry, message: Pgoutput.MessageInsert): InsertActivityModel {
  const action = 'create';
  const row = convertRowKeys(extractRowData(message.new));
  const ctx = extractActivityContext(entry, row);

  const entityOrResourceType = ctx.entityType ?? ctx.resourceType;
  const type = `${entityOrResourceType}.${actionToVerb(action)}`;

  return {
    id: nanoid(),
    userId: ctx.userId,
    entityType: ctx.entityType,
    resourceType: ctx.resourceType,
    action,
    tableName: getTableName(entry.table),
    type,
    entityId: ctx.entityId,
    organizationId: ctx.organizationId,
    changedKeys: null,
  };
}
