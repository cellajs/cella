import type { ActivityAction, EntityHierarchy, EntityType } from 'shared';
import { appConfig, entityIdColumnKey, hierarchy } from 'shared';
import { log } from '../lib/pino';
import type { ActivityWithoutId } from '../pipeline/parse-message';
import type { CdcRowData, TableMeta } from '../types';
import { isCountableRow } from './countability';

export interface CountDelta {
  /** Context key (organizationId or sub-context id): the row to update. */
  channelKey: string;
  /** e.g. `{ 'm:c:admin': 1, 'm:c:total': 1 }`; max-merge keys carry epoch ms, see `isMaxMergeKey`. */
  deltas: Record<string, number>;
}

/** `e:li:h:<type>` (last insert) / `e:lu:h:<type>` (last update): epoch-ms stamps, never summed. */
export function isActivityStampKey(key: string): boolean {
  return key.startsWith('e:li:') || key.startsWith('e:lu:');
}

/**
 * Keys merged via GREATEST, never summed: activity stamps and sequence frontiers `e:f:<type>`
 * (subtree max seq) / `e:f:h:<type>` (max seq of rows homed at the node). Mirrored by the
 * apply_count_deltas PG function.
 */
export function isMaxMergeKey(key: string): boolean {
  return isActivityStampKey(key) || key.startsWith('e:f:');
}

/**
 * Entity deltas apply to the organization and every populated ancestor; product activity stamps
 * apply only at the home context. Only live, published rows participate.
 */
export function getCountDeltas(
  tableMeta: TableMeta,
  activity: ActivityWithoutId,
  newRow: CdcRowData,
  oldRow: CdcRowData | null,
  h: EntityHierarchy = hierarchy,
): CountDelta[] {
  const { action, organizationId } = activity;

  // Memberships (active + inactive): counter deltas plus an org-level membership change signal.
  if (tableMeta.kind === 'resource' && (tableMeta.type === 'membership' || tableMeta.type === 'inactive_membership')) {
    const delta =
      tableMeta.type === 'membership'
        ? getMembershipDelta(action, newRow, oldRow)
        : getInactiveMembershipDelta(action, newRow, oldRow);
    const deltas = delta ? [delta] : [];
    // Org-level signal on every membership activity (invitations included) so catchup screens
    // membership changes in O(1) without scanning activities.
    if (organizationId) deltas.push({ channelKey: organizationId, deltas: { membership: 1 } });
    return deltas;
  }

  // Reparents inside the countable set re-credit contexts; changes outside it do nothing, matching SQL repair.
  if (tableMeta.kind === 'entity' && organizationId) {
    const countAction = deriveCountAction(action, newRow, oldRow);
    const deltas = countAction ? getEntityDeltas(countAction, organizationId, tableMeta.type, newRow, oldRow, h) : [];

    // Creates/publishes and content updates stamp the home context only; deletes and restores do not.
    if (h.isProduct(tableMeta.type) && countAction !== null && countAction !== 'delete') {
      const stampKey =
        action === 'create' && countAction === 'create'
          ? `e:li:h:${tableMeta.type}`
          : countAction === 'update'
            ? `e:lu:h:${tableMeta.type}`
            : null;
      if (stampKey) {
        // e:li:h: prefers publishedAt so CDC and recalculation stamp the same instant; e:lu:h: is updatedAt.
        const stampSource = stampKey.startsWith('e:li:')
          ? (getStringValue(newRow, 'publishedAt') ?? getStringValue(newRow, 'createdAt'))
          : getStringValue(newRow, 'updatedAt');
        const parsedMs = stampSource ? Date.parse(stampSource) : Number.NaN;
        deltas.push({
          channelKey: h.resolveDeepestAncestorId(tableMeta.type, newRow) ?? organizationId,
          deltas: { [stampKey]: Number.isNaN(parsedMs) ? Date.now() : parsedMs },
        });
      }
    }

    // Host references per embedded id; embedding cleanup rewrites soft-deleted references and emits their updates.
    for (const embedding of appConfig.productEmbeddings) {
      if (embedding.hostProduct !== tableMeta.type) continue;
      const col = embedding.hostColumn;
      const counterKey = `e:c:${embedding.hostProduct}`;

      if (action === 'delete') {
        const ids = getArrayValue(oldRow ?? newRow, col);
        for (const id of ids) {
          deltas.push({ channelKey: id, deltas: { [counterKey]: -1 } });
        }
      } else if (action === 'create') {
        const ids = getArrayValue(newRow, col);
        for (const id of ids) {
          deltas.push({ channelKey: id, deltas: { [counterKey]: 1 } });
        }
      } else if (action === 'update' && oldRow) {
        const oldIds = getArrayValue(oldRow, col);
        const newIds = getArrayValue(newRow, col);
        const added = newIds.filter((id) => !oldIds.includes(id));
        const removed = oldIds.filter((id) => !newIds.includes(id));
        for (const id of added) deltas.push({ channelKey: id, deltas: { [counterKey]: 1 } });
        for (const id of removed) deltas.push({ channelKey: id, deltas: { [counterKey]: -1 } });
      }
    }

    return deltas;
  }

  return [];
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Map a WAL action onto the countable set (`isCountableRow`) by its set edge: enter = create
 * (restore, publish), leave = delete (soft-delete, unpublish), stay inside = update, stay outside
 * = null (invisible to counters and stamps).
 */
function deriveCountAction(
  action: ActivityAction,
  newRow: CdcRowData,
  oldRow: CdcRowData | null,
): ActivityAction | null {
  if (action === 'create') return isCountableRow(newRow) ? 'create' : null;
  if (action === 'delete') return isCountableRow(oldRow ?? newRow) ? 'delete' : null;
  // REPLICA IDENTITY FULL always carries the old row on updates; fallback only.
  if (!oldRow) return isCountableRow(newRow) ? 'update' : null;
  const wasCountable = isCountableRow(oldRow);
  const nowCountable = isCountableRow(newRow);
  if (wasCountable && !nowCountable) return 'delete';
  if (!wasCountable && nowCountable) return 'create';
  return wasCountable && nowCountable ? 'update' : null;
}

function getStringValue(row: CdcRowData, key: string): string | null {
  const v = row[key];
  return typeof v === 'string' ? v : null;
}

function getArrayValue(row: CdcRowData, key: string): string[] {
  const v = row[key];
  return Array.isArray(v) ? v.filter((item): item is string => typeof item === 'string') : [];
}

/** Reads channelId and role, both NOT NULL: a missing value means a malformed row and yields no delta. */
function getMembershipDelta(action: ActivityAction, newRow: CdcRowData, oldRow: CdcRowData | null): CountDelta | null {
  const channelId = getStringValue(newRow, 'channelId');
  if (!channelId) return null;

  if (action === 'create') {
    const role = getStringValue(newRow, 'role');
    return role ? { channelKey: channelId, deltas: { [`m:c:${role}`]: 1, 'm:c:total': 1 } } : null;
  }

  if (action === 'delete') {
    const role = getStringValue(newRow, 'role');
    return role ? { channelKey: channelId, deltas: { [`m:c:${role}`]: -1, 'm:c:total': -1 } } : null;
  }

  if (action === 'update' && oldRow) {
    const oldRole = getStringValue(oldRow, 'role');
    const newRole = getStringValue(newRow, 'role');
    if (oldRole && newRole && oldRole !== newRole) {
      return { channelKey: channelId, deltas: { [`m:c:${oldRole}`]: -1, [`m:c:${newRole}`]: 1 } };
    }
  }

  return null;
}
/** Inactive membership m:c:pending delta; only rows with rejectedAt null count as pending. */
function getInactiveMembershipDelta(
  action: ActivityAction,
  newRow: CdcRowData,
  oldRow: CdcRowData | null,
): CountDelta | null {
  const channelId = getStringValue(newRow, 'channelId');
  if (!channelId) return null;

  if (action === 'create') {
    if (newRow.rejectedAt != null) return null;
    return { channelKey: channelId, deltas: { 'm:c:pending': 1 } };
  }

  if (action === 'delete') {
    const rejectedAt = newRow.rejectedAt ?? oldRow?.rejectedAt;
    if (rejectedAt != null) return null;
    return { channelKey: channelId, deltas: { 'm:c:pending': -1 } };
  }

  if (action === 'update' && oldRow) {
    const wasNull = oldRow.rejectedAt == null;
    const isNull = newRow.rejectedAt == null;
    if (wasNull && !isNull) {
      return { channelKey: channelId, deltas: { 'm:c:pending': -1 } };
    }
    if (!wasNull && isNull) {
      return { channelKey: channelId, deltas: { 'm:c:pending': 1 } };
    }
  }

  return null;
}

/**
 * Full attribution: a row counts on its organization and on every non-null ancestor context, so
 * members at any level screen catchup changes against their own context's counters. Set edges are
 * already remapped to create/delete by `deriveCountAction`.
 */
function getEntityDeltas(
  action: ActivityAction,
  organizationId: string,
  entityType: EntityType,
  newRow: CdcRowData,
  oldRow: CdcRowData | null,
  h: EntityHierarchy,
): CountDelta[] {
  if (!newRow.id) {
    log.warn(`getEntityDeltas: missing "id" for ${entityType}`, { action });
    return [];
  }

  const counterKey = `e:c:${entityType}`;
  const selfCountKey = `e:c:h:${entityType}`;

  if (action === 'create' || action === 'delete') {
    const value = action === 'create' ? 1 : -1;
    const row = action === 'delete' ? (oldRow ?? newRow) : newRow;
    const deltas: CountDelta[] = [{ channelKey: organizationId, deltas: { [counterKey]: value } }];
    for (const ancestor of h.resolveNonNullAncestors(entityType, row)) {
      if (ancestor.id === organizationId) continue; // org already counted above
      deltas.push({ channelKey: ancestor.id, deltas: { [counterKey]: value } });
    }
    // Self count: rows homed at the node only (deepest non-null ancestor, org fallback).
    const home = h.resolveDeepestAncestorId(entityType, row) ?? organizationId;
    deltas.push({ channelKey: home, deltas: { [selfCountKey]: value } });
    warnMissingAncestors(h, entityType, row);
    return deltas;
  }

  // Re-credit ancestor differences for updates inside the countable set.
  if (action === 'update' && oldRow) {
    const oldIds = new Set(h.resolveNonNullAncestors(entityType, oldRow).map((a) => a.id));
    const newIds = new Set(h.resolveNonNullAncestors(entityType, newRow).map((a) => a.id));
    const deltas: CountDelta[] = [];
    for (const id of newIds) {
      if (!oldIds.has(id)) deltas.push({ channelKey: id, deltas: { [counterKey]: 1 } });
    }
    for (const id of oldIds) {
      if (!newIds.has(id)) deltas.push({ channelKey: id, deltas: { [counterKey]: -1 } });
    }
    // Reparent moves the self count between homes.
    const oldHome = h.resolveDeepestAncestorId(entityType, oldRow) ?? organizationId;
    const newHome = h.resolveDeepestAncestorId(entityType, newRow) ?? organizationId;
    if (oldHome !== newHome) {
      deltas.push({ channelKey: oldHome, deltas: { [selfCountKey]: -1 } });
      deltas.push({ channelKey: newHome, deltas: { [selfCountKey]: 1 } });
    }
    return deltas;
  }

  return [];
}

/** Warns for missing ancestor ids, except ancestors declared nullable (variable-depth rows). */
function warnMissingAncestors(h: EntityHierarchy, entityType: EntityType, row: CdcRowData): void {
  const nullable = h.getNullableAncestors(entityType);
  for (const ancestor of h.getOrderedAncestors(entityType)) {
    const idColumn = entityIdColumnKey(ancestor);
    if (typeof row[idColumn] === 'string') continue;
    if (nullable.includes(ancestor)) continue;
    log.warn(`getEntityDeltas: missing "${idColumn}" for ${entityType}`, { id: row.id });
  }
}
