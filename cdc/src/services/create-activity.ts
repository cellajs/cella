import { getTableName } from 'drizzle-orm';
import type { ActivityAction } from 'shared';
import { appConfig, hierarchy } from 'shared';
import { log } from '../lib/pino';
import type { ActivityWithoutId } from '../pipeline/parse-message';
import type { TableMeta } from '../types';
import { actionToVerb, extractStxData } from '../utils';
import { channelIdColumnKeys } from '../utils/channel-columns';
import { getRowValue } from '../utils/get-row-value';

/** Shared by the insert, update and delete handlers. */
export function createActivity(
  tableMeta: TableMeta,
  row: Record<string, unknown>,
  action: ActivityAction,
  activityPatch?: Partial<ActivityWithoutId>,
): ActivityWithoutId {
  const entityType = tableMeta.kind === 'entity' ? tableMeta.type : null;
  const resourceType = tableMeta.kind === 'resource' ? tableMeta.type : null;
  const subjectType = tableMeta.type;

  // Channel entity ids come from the hierarchy ancestors; declared-nullable ancestors may be null.
  const channelIds: Record<string, string | null> = {};
  if (subjectType) {
    const nullableAncestors = hierarchy.getNullableAncestors(subjectType);
    for (const ancestor of hierarchy.getOrderedAncestors(subjectType)) {
      const colKey = appConfig.entityIdColumnKeys[ancestor];
      const value = getRowValue(row, colKey);
      if (!value && !nullableAncestors.includes(ancestor)) {
        log.warn(`Missing ancestor "${colKey}" for ${subjectType}`, { id: getRowValue(row, 'id') });
      }
      channelIds[colKey] = value ?? null;
    }
  }

  const rawSubjectId = getRowValue(row, 'id');
  if (!rawSubjectId) throw new Error(`createActivity: row missing "id" for ${subjectType} ${action}`);

  // The tenant row has no tenantId column: its own id is the tenantId.
  const tenantId = getRowValue(row, 'tenantId') ?? (resourceType === 'tenant' ? rawSubjectId : null);

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
    // Null defaults, overridden below by channelIds for entities with hierarchy ancestors.
    ...defaultChannelIds,
    createdAt: new Date().toISOString(),
    ...channelIds,
    changedFields: null,
    stx: extractStxData(row),
    ...activityPatch,
  };
}
