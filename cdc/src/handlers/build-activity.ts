import type { InsertActivityModel } from '#/db/schema/activities';
import type { ActivityAction } from '#/sync/activity-bus';
import { getTableName } from 'drizzle-orm';
import type { TableRegistryEntry } from '../types';
import { actionToVerb, extractActivityContext, extractStxData } from '../utils';

/**
 * Build a standardized InsertActivityModel from row data and table entry.
 * Shared by all handlers (insert, update, delete) to eliminate duplication.
 */
export function buildActivity(
  entry: TableRegistryEntry,
  row: Record<string, unknown>,
  action: ActivityAction,
  overrides?: Partial<InsertActivityModel>,
): InsertActivityModel {
  const ctx = extractActivityContext(entry, row);

  const entityOrResourceType = ctx.entityType ?? ctx.resourceType;
  const type = `${entityOrResourceType}.${actionToVerb(action)}`;

  const stx = extractStxData(row);

  return {
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
    stx,
    ...overrides,
  };
}
