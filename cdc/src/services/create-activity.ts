import { getTableName } from 'drizzle-orm';
import type { ActivityAction, EntityHierarchy } from 'shared';
import { actionToVerb, entityIdColumnKey, hierarchy } from 'shared';
import { log } from '../lib/pino';
import type { ActivityWithoutId } from '../pipeline/parse-message';
import type { TableMeta } from '../types';
import { channelIdColumnKeys } from '../utils/channel-columns';
import { extractStxData } from '../utils/extract-stx-data';
import { getStringValue } from '../utils/get-string-value';

/** Every channel id column of an activity, null: what the row names overrides them. */
const nullChannelIds: Record<string, null> = Object.fromEntries(channelIdColumnKeys.map((key) => [key, null]));

/**
 * The activity of a change, from its row: who made it, what it is about, and the channels it belongs to. Warns for an
 * empty ancestor column the hierarchy does not declare nullable: every change of a tracked row passes here.
 * @param changedFields - The fields an update changed; null for a create or a delete.
 */
export function createActivity(
  tableMeta: TableMeta,
  row: Record<string, unknown>,
  action: ActivityAction,
  changedFields: string[] | null = null,
  h: EntityHierarchy = hierarchy,
): ActivityWithoutId {
  const entityType = tableMeta.kind === 'entity' ? tableMeta.type : null;
  const resourceType = tableMeta.kind === 'resource' ? tableMeta.type : null;
  const subjectType = tableMeta.type;

  // A resource row has no place in the hierarchy: it carries the channel ids its own columns hold, so a membership's
  // activity names its organization.
  const channelIds: Record<string, string | null> = {};
  if (tableMeta.kind === 'resource') {
    for (const idKey of channelIdColumnKeys) {
      const value = getStringValue(row, idKey);
      if (value) channelIds[idKey] = value;
    }
  }
  // Channel entity ids come from the hierarchy ancestors; declared-nullable ancestors may be null.
  if (tableMeta.kind === 'entity') {
    const nullableAncestors = h.getNullableAncestors(subjectType);
    for (const ancestor of h.getOrderedAncestors(subjectType)) {
      const colKey = entityIdColumnKey(ancestor);
      const value = getStringValue(row, colKey);
      if (!value && !nullableAncestors.includes(ancestor)) {
        log.warn(`Missing ancestor "${colKey}" for ${subjectType}`, { id: getStringValue(row, 'id') });
      }
      channelIds[colKey] = value ?? null;
    }
  }

  const rawSubjectId = getStringValue(row, 'id');
  if (!rawSubjectId) throw new Error(`createActivity: row missing "id" for ${subjectType} ${action}`);

  // The tenant row has no tenantId column: its own id is the tenantId.
  const tenantId = getStringValue(row, 'tenantId') ?? (resourceType === 'tenant' ? rawSubjectId : null);

  return {
    tenantId,
    // The actor: whoever last touched the row. `revokedBy` is the api_keys update column.
    userId:
      getStringValue(row, 'updatedBy') ??
      getStringValue(row, 'revokedBy') ??
      getStringValue(row, 'createdBy') ??
      getStringValue(row, 'userId') ??
      null,
    entityType,
    resourceType,
    action,
    tableName: getTableName(tableMeta.table),
    type: `${subjectType}.${actionToVerb(action)}`,
    subjectId: rawSubjectId,
    // Null defaults, overridden below by channelIds for entities with hierarchy ancestors.
    ...nullChannelIds,
    createdAt: new Date().toISOString(),
    ...channelIds,
    changedFields,
    stx: extractStxData(row),
  };
}
