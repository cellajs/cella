import type { ActivityAction, EntityHierarchy, EntityType } from 'shared';
import { hierarchy } from 'shared';
import { entityCountHomePrefix, entityCountPrefix } from '#/modules/entities/counter-keys';
import type { ActivityWithoutId } from '../pipeline/parse-message';
import type { CdcRowData, TableMeta } from '../types';
import { isCountableRow } from './countability';
import { getStringValue } from './get-string-value';

/** What one change adds to the counters of one channel. */
export interface CountDelta {
  /** The channel whose `channel_counters` row takes the deltas: an organization, or a channel below one. */
  channelKey: string;
  /** e.g. `{ 'm:c:admin': 1, 'm:c:total': 1 }`; an activity stamp (`e:li:h:<type>`, `e:lu:h:<type>`) carries epoch ms and merges as a maximum. */
  deltas: Record<string, number>;
}

/**
 * Entity deltas apply to the organization and every populated ancestor; product activity stamps
 * apply only at the home channel. Only live, published rows participate.
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
    const delta = tableMeta.type === 'membership' ? getMembershipDelta(action, newRow, oldRow) : getInactiveMembershipDelta(action, newRow, oldRow);
    const deltas = delta ? [delta] : [];
    // Org-level signal on every membership activity (invitations included) so catchup screens
    // membership changes in O(1) without scanning activities.
    if (organizationId) deltas.push({ channelKey: organizationId, deltas: { membership: 1 } });
    return deltas;
  }

  // Reparents inside the countable set re-credit channels; changes outside it do nothing, matching SQL repair.
  if (tableMeta.kind === 'entity' && organizationId) {
    const countAction = deriveCountAction(action, newRow, oldRow);
    const deltas = countAction ? getEntityDeltas(countAction, organizationId, tableMeta.type, newRow, oldRow, h) : [];

    // Creates/publishes and content updates stamp the home channel only; deletes and restores do not.
    if (h.isProduct(tableMeta.type) && countAction !== null && countAction !== 'delete') {
      const stampKey =
        action === 'create' && countAction === 'create' ? `e:li:h:${tableMeta.type}` : countAction === 'update' ? `e:lu:h:${tableMeta.type}` : null;
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

    return deltas;
  }

  return [];
}

/**
 * Map a WAL action onto the countable set (`isCountableRow`) by its set edge: enter = create
 * (restore, publish), leave = delete (soft-delete, unpublish), stay inside = update, stay outside
 * = null (invisible to counters and stamps).
 */
function deriveCountAction(action: ActivityAction, newRow: CdcRowData, oldRow: CdcRowData | null): ActivityAction | null {
  if (action === 'create') return isCountableRow(newRow) ? 'create' : null;
  if (action === 'delete') return isCountableRow(newRow) ? 'delete' : null;
  // REPLICA IDENTITY FULL always carries the old row on updates; fallback only.
  if (!oldRow) return isCountableRow(newRow) ? 'update' : null;
  const wasCountable = isCountableRow(oldRow);
  const nowCountable = isCountableRow(newRow);
  if (wasCountable && !nowCountable) return 'delete';
  if (!wasCountable && nowCountable) return 'create';
  return wasCountable && nowCountable ? 'update' : null;
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
function getInactiveMembershipDelta(action: ActivityAction, newRow: CdcRowData, oldRow: CdcRowData | null): CountDelta | null {
  const channelId = getStringValue(newRow, 'channelId');
  if (!channelId) return null;

  if (action === 'create') {
    if (newRow.rejectedAt != null) return null;
    return { channelKey: channelId, deltas: { 'm:c:pending': 1 } };
  }

  if (action === 'delete') {
    if (newRow.rejectedAt != null) return null;
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
 * Full attribution: a row counts on its organization and on every non-null ancestor channel, so
 * members at any level screen catchup changes against their own channel's counters. Set edges are
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
  const counterKey = `${entityCountPrefix}${entityType}`;
  const selfCountKey = `${entityCountHomePrefix}${entityType}`;

  if (action === 'create' || action === 'delete') {
    const value = action === 'create' ? 1 : -1;
    const row = action === 'delete' ? (oldRow ?? newRow) : newRow;
    const deltas: CountDelta[] = [{ channelKey: organizationId, deltas: { [counterKey]: value } }];
    for (const ancestor of h.resolveNonNullAncestors(entityType, row)) {
      if (ancestor.id === organizationId) continue;
      deltas.push({ channelKey: ancestor.id, deltas: { [counterKey]: value } });
    }
    // Self count: rows homed at the node only (deepest non-null ancestor, org fallback).
    const home = h.resolveDeepestAncestorId(entityType, row) ?? organizationId;
    deltas.push({ channelKey: home, deltas: { [selfCountKey]: value } });
    return deltas;
  }

  // Re-credit ancestor differences for updates inside the countable set.
  if (action === 'update' && oldRow) {
    const oldIds = new Set(h.resolveNonNullAncestors(entityType, oldRow).map((ancestor) => ancestor.id));
    const newIds = new Set(h.resolveNonNullAncestors(entityType, newRow).map((ancestor) => ancestor.id));
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
