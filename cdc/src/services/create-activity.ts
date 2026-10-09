import { getTableName } from 'drizzle-orm';
import type { ActivityAction } from 'shared';
import { actionToVerb, appConfig, hierarchy } from 'shared';
import { log } from '../lib/pino';
import type { ActivityWithoutId } from '../pipeline/parse-message';
import type { TableMeta } from '../types';
import { channelIdColumnKeys } from '../utils/channel-columns';
import { extractStxData } from '../utils/extract-stx-data';

/** A column of a row whose keys are camelCase already, when it holds a string. */
const getRowValue = (row: Record<string, unknown>, key: string): string | null => {
  const value = row[key];
  return typeof value === 'string' ? value : null;
};

/** The activity of a change, from its row: who made it, what it is about, and the channels it belongs to. */
export function createActivity(
  tableMeta: TableMeta,
  row: Record<string, unknown>,
  action: ActivityAction,
  activityPatch?: Partial<ActivityWithoutId>,
): ActivityWithoutId {
  const entityType = tableMeta.kind === 'entity' ? tableMeta.type : null;
  const resourceType = tableMeta.kind === 'resource' ? tableMeta.type : null;
  const subjectType = tableMeta.type;

  // A resource row has no place in the hierarchy: it carries the channel ids its own columns hold, so a membership's
  // activity names its organization.
  const channelIds: Record<string, string | null> = {};
  if (tableMeta.kind === 'resource') {
    for (const idKey of channelIdColumnKeys) {
      const value = getRowValue(row, idKey);
      if (value) channelIds[idKey] = value;
    }
  }
  // Channel entity ids come from the hierarchy ancestors; declared-nullable ancestors may be null.
  if (subjectType && tableMeta.kind === 'entity') {
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
    // The actor: whoever last touched the row. `revokedBy` is the api_keys update column.
    userId: getRowValue(row, 'updatedBy') ?? getRowValue(row, 'revokedBy') ?? getRowValue(row, 'createdBy') ?? getRowValue(row, 'userId') ?? null,
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
