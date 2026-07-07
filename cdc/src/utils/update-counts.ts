import { appConfig, hierarchy } from 'shared';
import type { ActivityAction } from 'shared';
import type { ActivityWithoutId } from '../pipeline/parse-message';
import type { TableMeta } from '../types';
import type { CdcRowData } from '../types';
import { isSoftDeleteTransition } from './is-soft-delete-transition';
import { log } from '../lib/pino';

export interface CountDelta {
  /** Context key (organizationId or sub-context id) — the row to update */
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
 * Membership seq (s:membership on the org row):
 *   - +1 on every membership / inactive_membership activity (change signal for catchup screening)
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

  // Memberships (active + inactive): counter deltas plus an org-level membership seq signal.
  if (tableMeta.kind === 'resource' && (tableMeta.type === 'membership' || tableMeta.type === 'inactive_membership')) {
    const delta =
      tableMeta.type === 'membership'
        ? getMembershipDelta(action, newRow, oldRow)
        : getInactiveMembershipDelta(action, newRow, oldRow);
    const deltas = delta ? [delta] : [];
    // Bump the org-level membership seq on every membership / inactive-membership activity so
    // catchup can detect membership changes via O(1) counter screening (no activity scan needed).
    // Pending invitations appear in member lists too, so inactive memberships bump it as well.
    if (organizationId) deltas.push({ contextKey: organizationId, deltas: { 's:membership': 1 } });
    return deltas;
  }

  // Entities: track entity type counts on org + parent context
  if (tableMeta.kind === 'entity' && organizationId) {
    const countAction = isSoftDeleteTransition(newRow, oldRow) ? 'delete' : action;
    const deltas = getEntityDeltas(countAction, organizationId, tableMeta.type, newRow, oldRow);

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
 * Reads only the fields it needs (contextId, role) off the WAL row — both are
 * NOT NULL columns, so a missing value means a malformed row and yields no delta.
 */
function getMembershipDelta(
  action: ActivityAction,
  newRow: CdcRowData,
  oldRow: CdcRowData | null,
): CountDelta | null {
  const contextId = getStringValue(newRow, 'contextId');
  if (!contextId) return null;

  if (action === 'create') {
    const role = getStringValue(newRow, 'role');
    return role ? { contextKey: contextId, deltas: { [`m:${role}`]: 1, 'm:total': 1 } } : null;
  }

  if (action === 'delete') {
    const role = getStringValue(newRow, 'role');
    return role ? { contextKey: contextId, deltas: { [`m:${role}`]: -1, 'm:total': -1 } } : null;
  }

  if (action === 'update' && oldRow) {
    const oldRole = getStringValue(oldRow, 'role');
    const newRole = getStringValue(newRow, 'role');
    // Only emit delta if role actually changed
    if (oldRole && newRole && oldRole !== newRole) {
      return { contextKey: contextId, deltas: { [`m:${oldRole}`]: -1, [`m:${newRole}`]: 1 } };
    }
  }

  return null;
}
/**
 * Get inactive membership delta based on create/update/delete action and rejectedAt field.
 */
function getInactiveMembershipDelta(
  action: ActivityAction,
  newRow: CdcRowData,
  oldRow: CdcRowData | null,
): CountDelta | null {
  const contextId = getStringValue(newRow, 'contextId');
  if (!contextId) return null;

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
    log.warn(`getEntityDeltas: missing "id" for ${entityType}`, { action });
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
    if (!parentId) log.warn(`getEntityDeltas: missing "${parentIdColumn}" for ${entityType}`, { id: row.id });
    if (parentId) {
      deltas.push({ contextKey: parentId, deltas: { [`e:${entityType}`]: value } });
    }
  }

  return deltas;
}
