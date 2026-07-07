import type { ActivityAction } from 'shared';
import { getTableName } from 'drizzle-orm';
import { appConfig, hierarchy } from 'shared';
import type { TableMeta } from '../types';
import type { ActivityWithoutId } from '../pipeline/parse-message';
import { actionToVerb, extractStxData } from '../utils';
import { contextIdColumnKeys } from '../utils/context-columns';
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

  // Derive context entity IDs from hierarchy ancestors
  const contextEntityIds: Record<string, string | null> = {};
  if (subjectType) {
    for (const ancestor of hierarchy.getOrderedAncestors(subjectType)) {
      const colKey = appConfig.entityIdColumnKeys[ancestor];
      const value = getRowValue(row, colKey);
      if (!value) log.warn(`Missing ancestor "${colKey}" for ${subjectType}`, { id: getRowValue(row, 'id') });
      contextEntityIds[colKey] = value ?? null;
    }
  }

  const rawSubjectId = getRowValue(row, 'id');
  if (!rawSubjectId) throw new Error(`createActivity: row missing "id" for ${subjectType} ${action}`);

  // For the tenant resource itself, the row has no tenantId column — its own id IS the tenantId.
  const tenantId = getRowValue(row, 'tenantId') ?? (resourceType === 'tenant' ? rawSubjectId : null);

  // Build default nulls for all context entity ID columns, driven by config
  const defaultContextIds: Record<string, null> = {};
  for (const idKey of contextIdColumnKeys) {
    defaultContextIds[idKey] = null;
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
    // Default context IDs to null — overridden by contextEntityIds for entities with hierarchy ancestors
    ...defaultContextIds,
    createdAt: new Date().toISOString(),
    ...contextEntityIds,
    changedFields: null,
    stx: extractStxData(row),
    ...activityPatch,
  };
}
