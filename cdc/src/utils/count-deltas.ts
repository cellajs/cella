import type { ActivityAction, EntityHierarchy, EntityType } from 'shared';
import { hierarchy } from 'shared';
import { entityCountHomePrefix, entityCountPrefix, signalVersionPrefix } from '#/modules/entities/counter-keys';
import { type VersionedSignal, versionedSignalsOf } from '#/modules/entities/stream/versioned-signals';
import type { CdcActivity } from '../pipeline/parse-message';
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
 * apply only at the home channel. Only live, published rows participate. A change that moves versioned signals
 * moves their versions on its organization's row.
 * @param signals - The versioned signals the change moves; its table's for its action when absent.
 */
export function getCountDeltas(
  tableMeta: TableMeta,
  activity: CdcActivity,
  newRow: CdcRowData,
  oldRow: CdcRowData | null,
  h: EntityHierarchy = hierarchy,
  signals: VersionedSignal[] = versionedSignalsOf(tableMeta.type, activity.action, h),
): CountDelta[] {
  const deltas = getTableDeltas(tableMeta, activity, newRow, oldRow, h);
  if (!activity.organizationId || signals.length === 0) return deltas;
  const versions = Object.fromEntries(signals.map(({ type }) => [`${signalVersionPrefix}${type}`, 1]));
  return [...deltas, { channelKey: activity.organizationId, deltas: versions }];
}

/** The counts and stamps one change of a table moves. */
function getTableDeltas(
  tableMeta: TableMeta,
  activity: CdcActivity,
  newRow: CdcRowData,
  oldRow: CdcRowData | null,
  h: EntityHierarchy,
): CountDelta[] {
  const { action, organizationId } = activity;

  // Memberships and invitations: the counts of their roles.
  if (tableMeta.kind === 'resource' && (tableMeta.type === 'membership' || tableMeta.type === 'invitation')) {
    const delta = tableMeta.type === 'membership' ? getMembershipDelta(action, newRow, oldRow) : getInvitationDelta(action, newRow, oldRow);
    return delta ? [delta] : [];
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
  // A soft delete carries the row before it; a create or a hard delete one row image.
  if (action === 'delete' && oldRow) return isCountableRow(oldRow) ? action : null;
  // The parser refuses an update without its old row.
  if (action !== 'update' || !oldRow) return isCountableRow(newRow) ? action : null;
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

/** Invitation m:c:pending delta; a held or pending row counts, a declined one does not. */
function getInvitationDelta(action: ActivityAction, newRow: CdcRowData, oldRow: CdcRowData | null): CountDelta | null {
  const channelId = getStringValue(newRow, 'channelId');
  if (!channelId) return null;

  if (action === 'create') {
    if (newRow.status === 'declined') return null;
    return { channelKey: channelId, deltas: { 'm:c:pending': 1 } };
  }

  if (action === 'delete') {
    if (newRow.status === 'declined') return null;
    return { channelKey: channelId, deltas: { 'm:c:pending': -1 } };
  }

  if (action === 'update' && oldRow) {
    const wasOpen = oldRow.status !== 'declined';
    const isOpen = newRow.status !== 'declined';
    if (wasOpen && !isOpen) {
      return { channelKey: channelId, deltas: { 'm:c:pending': -1 } };
    }
    if (!wasOpen && isOpen) {
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
