import { appConfig, hierarchy } from 'shared';
import type { ActivityAction } from 'shared';
import type { ActivityWithoutId } from '../pipeline/parse-message';
import type { InactiveMembershipModel } from '#/modules/memberships/inactive-memberships-db';
import type { MembershipModel } from '#/modules/memberships/memberships-db';
import type { TableMeta } from '../types';
import type { CdcRowData } from '../types';
import { logEvent } from '../lib/pino';

export interface CountDelta {
  /** Context key (organizationId or 'public:{type}') — the row to update */
  contextKey: string;
  /** Key-value deltas: e.g. { 'm:admin': 1, 'm:total': 1 } or { 'e:attachment': -1 } */
  deltas: Record<string, number>;
}

/**
 * Determine count deltas from a CDC event.
 *
 * Membership counts (m: prefix):
 *   - membership create → +1 role, +1 total
 *   - membership delete → -1 role, -1 total
 *   - membership update (role change) → -1 old role, +1 new role
 *
 * Inactive membership counts (m:pending):
 *   - create with rejectedAt=null → +1 pending
 *   - delete with rejectedAt=null → -1 pending
 *   - update rejectedAt null→non-null → -1 pending
 *
 * Entity counts (e: prefix):
 *   - entity create → +1 on org AND parent context (e.g., project)
 *   - entity delete → -1 on org AND parent context
 */
export function getCountDeltas(
  tableMeta: TableMeta,
  activity: ActivityWithoutId,
  newRow: CdcRowData,
  oldRow: CdcRowData | null,
): CountDelta[] {
  const { action, organizationId } = activity;

  // Active memberships: track role counts + total
  if (tableMeta.kind === 'resource' && tableMeta.type === 'membership') {
    const delta = getMembershipDelta(action, newRow as MembershipModel, oldRow as MembershipModel | null);
    return delta ? [delta] : [];
  }

  // Inactive memberships: track pending count
  if (tableMeta.kind === 'resource' && tableMeta.type === 'inactive_membership') {
    const delta = getInactiveMembershipDelta(action, newRow as InactiveMembershipModel, oldRow as InactiveMembershipModel | null);
    return delta ? [delta] : [];
  }

  // Entities: track entity type counts on org + parent context
  if (tableMeta.kind === 'entity' && organizationId) {
    const deltas = getEntityDeltas(action, organizationId, tableMeta.type, newRow, oldRow);

    // Embedding counters: track e:<hostEntity> counts per embedded entity ID
    for (const embedding of appConfig.entityEmbeddings) {
      if (embedding.hostEntity !== tableMeta.type) continue;
      const col = embedding.hostColumn;
      const counterKey = `e:${embedding.hostEntity}`;

      if (action === 'delete') {
        // Decrement for all embedded IDs in the deleted entity
        const ids = getArrayValue(oldRow ?? newRow, col);
        for (const id of ids) {
          deltas.push({ contextKey: id, deltas: { [counterKey]: -1 } });
        }
      } else if (action === 'create') {
        // Increment for all embedded IDs in the new entity
        const ids = getArrayValue(newRow, col);
        for (const id of ids) {
          deltas.push({ contextKey: id, deltas: { [counterKey]: 1 } });
        }
      } else if (action === 'update' && oldRow) {
        // Diff: increment added, decrement removed
        const oldIds = getArrayValue(oldRow, col);
        const newIds = getArrayValue(newRow, col);
        const added = newIds.filter((id) => !oldIds.includes(id));
        const removed = oldIds.filter((id) => !newIds.includes(id));
        for (const id of added) deltas.push({ contextKey: id, deltas: { [counterKey]: 1 } });
        for (const id of removed) deltas.push({ contextKey: id, deltas: { [counterKey]: -1 } });
      }
    }

    return deltas;
  }

  return [];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getStringValue(row: CdcRowData | null | undefined, key: string): string | null {
  if (!row) return null;
  const v = row[key];
  return typeof v === 'string' ? v : null;
}

function getArrayValue(row: CdcRowData | undefined, key: string): string[] {
  if (!row) return [];
  const v = row[key];
  return Array.isArray(v) ? v.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * Get membership count delta based on create/update/delete action and role change.
 */
function getMembershipDelta(
  action: ActivityAction,
  newRow: MembershipModel,
  oldRow: MembershipModel | null,
): CountDelta | null {
  const { contextId } = newRow;

  if (action === 'create') {
    return { contextKey: contextId, deltas: { [`m:${newRow.role}`]: 1, 'm:total': 1 } };
  }

  if (action === 'delete') {
    return { contextKey: contextId, deltas: { [`m:${newRow.role}`]: -1, 'm:total': -1 } };
  }

  if (action === 'update' && oldRow) {
    // Only emit delta if role actually changed
    if (oldRow.role !== newRow.role) {
      return { contextKey: contextId, deltas: { [`m:${oldRow.role}`]: -1, [`m:${newRow.role}`]: 1 } };
    }
  }

  return null;
}
/**
 * Get inactive membership delta based on create/update/delete action and rejectedAt field.
 */
function getInactiveMembershipDelta(
  action: ActivityAction,
  newRow: InactiveMembershipModel,
  oldRow: InactiveMembershipModel | null,
): CountDelta | null {
  const { contextId } = newRow;

  if (action === 'create') {
    // Only count pending (not rejected)
    if (newRow.rejectedAt != null) return null;
    return { contextKey: contextId, deltas: { 'm:pending': 1 } };
  }

  if (action === 'delete') {
    // Only decrement if it was pending (rejectedAt was null)
    const rejectedAt = newRow.rejectedAt ?? oldRow?.rejectedAt;
    if (rejectedAt != null) return null;
    return { contextKey: contextId, deltas: { 'm:pending': -1 } };
  }

  if (action === 'update' && oldRow) {
    const wasNull = oldRow.rejectedAt == null;
    const isNull = newRow.rejectedAt == null;
    // Transition from pending to rejected
    if (wasNull && !isNull) {
      return { contextKey: contextId, deltas: { 'm:pending': -1 } };
    }
    // Transition from rejected to pending (unlikely but handle it)
    if (!wasNull && isNull) {
      return { contextKey: contextId, deltas: { 'm:pending': 1 } };
    }
  }

  return null;
}

/**
 * Get entity count deltas based on create/delete action. Also emits deltas for parent context if applicable (e.g., project for a task).
 */
function getEntityDeltas(
  action: ActivityAction,
  organizationId: string,
  entityType: string,
  newRow: CdcRowData,
  oldRow: CdcRowData | null,
): CountDelta[] {
  // Updates don't change counts
  if (action !== 'create' && action !== 'delete') return [];

  // Assert required fields are present
  if (!newRow.id) {
    logEvent('warn', `getEntityDeltas: missing "id" for ${entityType}`, { action });
    return [];
  }

  const value = action === 'create' ? 1 : -1;
  const deltas: CountDelta[] = [{ contextKey: organizationId, deltas: { [`e:${entityType}`]: value } }];

  // Also emit delta for parent context (e.g., task -> project)
  const parentType = hierarchy.getParent(entityType);
  if (parentType && parentType !== 'organization') {
    const parentIdColumn = appConfig.entityIdColumnKeys[parentType];
    const row = action === 'delete' ? (oldRow ?? newRow) : newRow;
    const parentId = getStringValue(row, parentIdColumn);
    if (!parentId) logEvent('warn', `getEntityDeltas: missing "${parentIdColumn}" for ${entityType}`, { id: row.id });
    if (parentId) {
      deltas.push({ contextKey: parentId, deltas: { [`e:${entityType}`]: value } });
    }
  }

  return deltas;
}
