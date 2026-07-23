import { appConfig, entityIdColumnKey, hierarchy } from 'shared';
import type { EntityHierarchy, ActivityAction, EntityType } from 'shared';
import type { ActivityWithoutId } from '../pipeline/parse-message';
import type { TableMeta } from '../types';
import type { CdcRowData } from '../types';
import { isCountableRow } from './countability';
import { log } from '../lib/pino';

export interface CountDelta {
  /** Context key (organizationId or sub-context id): the row to update */
  channelKey: string;
  /**
   * Key-value deltas: e.g. { 'm:c:admin': 1, 'm:c:total': 1 } or { 'e:c:attachment': -1 }.
   * `e:li:h:<type>` / `e:lu:h:<type>` keys carry an epoch-ms activity stamp that merges via max.
   */
  deltas: Record<string, number>;
}

/**
 * `e:li:h:<type>` (last insert) / `e:lu:h:<type>` (last update) keys carry epoch-ms activity
 * stamps that merge via max and never sum. Mirrored by the
 * apply_count_deltas PG function.
 */
export function isActivityStampKey(key: string): boolean {
  return key.startsWith('e:li:') || key.startsWith('e:lu:');
}

/**
 * Keys that merge via GREATEST, not summing: activity stamps (`e:li:`/`e:lu:`, epoch ms)
 * and sequence frontiers `e:f:<type>` (subtree: max org-sequence position of that type at
 * or below the node) and `e:f:h:<type>` (self: max seq of rows HOMED at the node). The
 * `e:f:` prefix covers both frontier families. Mirrored by the apply_count_deltas PG function.
 */
export function isMaxMergeKey(key: string): boolean {
  return isActivityStampKey(key) || key.startsWith('e:f:');
}

/**
 * Derives membership and entity counter changes from a CDC event.
 * Entity deltas apply to the organization and populated ancestors, while product activity
 * stamps apply only at home context. Only live, published rows participate.
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
    // Bump the org-level membership signal on every membership / inactive-membership activity so
    // catchup can detect membership changes via O(1) counter screening (no activity scan needed).
    // Pending invitations appear in member lists too, so inactive memberships bump it as well.
    if (organizationId) deltas.push({ channelKey: organizationId, deltas: { 'membership': 1 } });
    return deltas;
  }

  // Count live, published entity-set edges across organization and populated ancestors.
  // Reparents inside the set re-credit contexts; changes outside it do nothing, matching SQL repair.
  if (tableMeta.kind === 'entity' && organizationId) {
    const countAction = deriveCountAction(action, newRow, oldRow);
    const deltas = countAction ? getEntityDeltas(countAction, organizationId, tableMeta.type, newRow, oldRow, h) : [];

    // Stamp creates/publishes and content updates only at the effective home context.
    // Deletes and restores leave activity time unchanged; drafts never reach this stream.
    if (h.isProduct(tableMeta.type) && countAction !== null && countAction !== 'delete') {
      const stampKey =
        action === 'create' && countAction === 'create'
          ? `e:li:h:${tableMeta.type}`
          : countAction === 'update'
            ? `e:lu:h:${tableMeta.type}`
            : null;
      if (stampKey) {
        // e:li:h: prefers publishedAt so CDC and recalculation stamp the same instant on
        // draft-lifecycle tables (createdAt elsewhere); e:lu:h: is always updatedAt.
        const stampSource = stampKey.startsWith('e:li:')
          ? (getStringValue(newRow, 'publishedAt') ?? getStringValue(newRow, 'createdAt'))
          : getStringValue(newRow, 'updatedAt');
        const parsedMs = stampSource ? Date.parse(stampSource) : Number.NaN;
        deltas.push({
          channelKey: h.resolveDeepestAncestorId(tableMeta.type, newRow) ?? organizationId,
          deltas: { [stampKey]: Number.isNaN(parsedMs) ? Date.now() : parsedMs } });
      }
    }

  // Count host references per embedded ID. Publication filtering supplies draft edges;
  // embedding cleanup rewrites soft-deleted references and emits their updates.
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
 * Map a WAL action onto the countable set (`isCountableRow`): creates and deletes count
 * only when the row is (or was) in the set; an update counts by its countable-set edge:
 * enter = create (restore, publish), leave = delete (soft-delete, unpublish), stay
 * inside = update, stay outside = nothing (trash edits). `null` = the
 * event is invisible to counters and stamps.
 */
function deriveCountAction(action: ActivityAction, newRow: CdcRowData, oldRow: CdcRowData | null): ActivityAction | null {
  if (action === 'create') return isCountableRow(newRow) ? 'create' : null;
  if (action === 'delete') return isCountableRow(oldRow ?? newRow) ? 'delete' : null;
  // REPLICA IDENTITY FULL always carries the old row on updates; belt-and-braces fallback.
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

/**
 * Membership count delta for create/update/delete and role changes. Reads only
 * channelId and role off the WAL row; both are NOT NULL columns, so a missing
 * value means a malformed row and yields no delta.
 */
function getMembershipDelta(
  action: ActivityAction,
  newRow: CdcRowData,
  oldRow: CdcRowData | null,
): CountDelta | null {
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
 * Entity count deltas. Full attribution: a row counts on its organization and on
 * every non-null ancestor context (not just the declared parent), so members at
 * any level can screen catchup changes against their own context's counters.
 * Countable-set edges (soft-delete/restore, publish/unpublish) are remapped to
 * delete/create by the caller (`deriveCountAction`).
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
    // Self count: rows HOMED at the node only (deepest non-null ancestor, org fallback),
    // the summary a self view is answered from (mirrors the e:li:h:/e:lu:h: placement rule).
    const home = h.resolveDeepestAncestorId(entityType, row) ?? organizationId;
    deltas.push({ channelKey: home, deltas: { [selfCountKey]: value } });
    warnMissingAncestors(h, entityType, row);
    return deltas;
  }

  // Re-credit ancestor differences for updates within the countable set.
  // Set-crossing changes already map to create or delete.
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

/**
 * Warn for missing ancestor ids, except ancestors declared nullable (variable-depth rows).
 */
function warnMissingAncestors(h: EntityHierarchy, entityType: EntityType, row: CdcRowData): void {
  const nullable = h.getNullableAncestors(entityType);
  for (const ancestor of h.getOrderedAncestors(entityType)) {
    const idColumn = entityIdColumnKey(ancestor);
    if (typeof row[idColumn] === 'string') continue;
    if (nullable.includes(ancestor)) continue;
    log.warn(`getEntityDeltas: missing "${idColumn}" for ${entityType}`, { id: row.id });
  }
}
