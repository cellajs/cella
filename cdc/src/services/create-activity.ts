import type { ActivityAction } from 'shared';
import { getTableName } from 'drizzle-orm';
import { appConfig, hierarchy } from 'shared';
import type { TableMeta } from '../types';
import type { ActivityWithoutId } from '../pipeline/parse-message';
import { actionToVerb, extractStxData } from '../utils';
import { channelIdColumnKeys } from '../utils/channel-columns';
import { getRowValue } from '../utils/get-row-value';
import { log } from '../lib/pino';

/**
 * Build a standardized InsertActivityModel from row data and table metadata.
 * Shared by all handlers (insert, update, delete) to eliminate duplication.
 */
export function createActivity(
  tableMeta: TableMeta,
  row: Record<string, unknown>,
  action: ActivityAction,
  activityPatch?: Partial<ActivityWithoutId>,
): ActivityWithoutId {
  const entityType = tableMeta.kind === 'entity' ? tableMeta.type : null;
  const resourceType = tableMeta.kind === 'resource' ? tableMeta.type : null;
  const subjectType = tableMeta.type;

  // Derive channel entity IDs from hierarchy ancestors. Declared-nullable ancestors may
  // legitimately be null (variable-depth rows, e.g. a course-stream item): no warning.
  const channelEntityIds: Record<string, string | null> = {};
  if (subjectType) {
    const nullableAncestors = hierarchy.getNullableAncestors(subjectType);
    for (const ancestor of hierarchy.getOrderedAncestors(subjectType)) {
      const colKey = appConfig.entityIdColumnKeys[ancestor];
      const value = getRowValue(row, colKey);
      if (!value && !nullableAncestors.includes(ancestor)) {
        log.warn(`Missing ancestor "${colKey}" for ${subjectType}`, { id: getRowValue(row, 'id') });
      }
      channelEntityIds[colKey] = value ?? null;
    }
  }

  const rawSubjectId = getRowValue(row, 'id');
  if (!rawSubjectId) throw new Error(`createActivity: row missing "id" for ${subjectType} ${action}`);

  // For the tenant resource itself, the row has no tenantId column: its own id IS the tenantId.
  const tenantId = getRowValue(row, 'tenantId') ?? (resourceType === 'tenant' ? rawSubjectId : null);

  // Build default nulls for all channel entity ID columns, driven by config
  const defaultChannelIds: Record<string, null> = {};
  for (const idKey of channelIdColumnKeys) {
    defaultChannelIds[idKey] = null;
  }

  return {
    tenantId,
    userId: getRowValue(row, 'updatedBy') ?? getRowValue(row, 'createdBy') ?? getRowValue(row, 'userId') ?? null,
    entityType,
    resourceType,
    action,
    tableName: getTableName(tableMeta.table),
    type: `${subjectType}.${actionToVerb(action)}`,
    subjectId: rawSubjectId,
    // Default context IDs to null, overridden by channelEntityIds for entities with hierarchy ancestors
    ...defaultChannelIds,
    createdAt: new Date().toISOString(),
    ...channelEntityIds,
    changedFields: null,
    stx: extractStxData(row),
    ...activityPatch,
  };
}
