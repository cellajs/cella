import { appConfig, hierarchy, resolveDeepestAncestorId, resolveNonNullAncestors } from 'shared';
import type { ActivityAction, AncestorSource, EntityType } from 'shared';
import type { ActivityWithoutId } from '../pipeline/parse-message';
import type { TableMeta } from '../types';
import type { CdcRowData } from '../types';
import { isCountableRow } from './countability';
import { log } from '../lib/pino';

export interface CountDelta {
  /** Context key (organizationId or sub-context id): the row to update */
  channelKey: string;
  /**
   * Key-value deltas: e.g. { 'm:admin': 1, 'm:total': 1 } or { 'e:attachment': -1 }.
   * `li:<type>` / `lu:<type>` keys carry an epoch-ms activity stamp that merges via max.
   */
  deltas: Record<string, number>;
}

/** Hierarchy surface the counter machinery needs; injectable for synthetic-hierarchy tests. */
export type CountsHierarchy = AncestorSource & {
  isProduct(entityType: string): boolean;
};

/**
 * `li:<type>` (last insert) / `lu:<type>` (last update) keys carry epoch-ms activity
 * stamps that merge via max and never sum. Mirrored by the
 * apply_count_deltas PG function.
 */
export function isActivityStampKey(key: string): boolean {
  return key.startsWith('li:') || key.startsWith('lu:');
}

/**
 * Keys that merge via GREATEST instead of summing: activity stamps (`li:`/`lu:`, epoch ms)
 * and sequence frontiers — `f:<type>` (subtree: max org-sequence position of that type at
 * or below the node) and `fs:<type>` (self: max seq of rows HOMED at the node).
 * Mirrored by the apply_count_deltas PG function.
 */
export function isMaxMergeKey(key: string): boolean {
  return isActivityStampKey(key) || key.startsWith('f:') || key.startsWith('fs:');
}

/**
 * Determine count deltas from a CDC event.
 *
 * Membership rows yield `m:<role>` / `m:total` deltas plus an org-level
 * `membership` change-signal bump used for catchup screening. Inactive
 * memberships count as `m:pending` while rejectedAt is null. Entity rows yield
 * `e:<type>` deltas on the org and every non-null ancestor context; updates
 * that change ancestor ids re-credit the counters. Product rows also stamp
 * `li:<type>` (last insert) / `lu:<type>` (last update) epoch ms at their home
 * context only.
 *
 * Only COUNTABLE rows participate: live AND published (`isCountableRow`). Draft
 * product rows never arrive here (publication row filter + entrance guard); the
 * publish edge arrives as a plain INSERT and counts as a create.
 */
export function getCountDeltas(
  tableMeta: TableMeta,
  activity: ActivityWithoutId,
  newRow: CdcRowData,
  oldRow: CdcRowData | null,
  h: CountsHierarchy = hierarchy,
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

  // Entities: track entity type counts on org + non-null ancestor contexts.
  // The count action derives from countable-set edges (live AND published): crossing
  // into the set counts as create, crossing out as delete, moving inside it is a plain
  // update (ancestor re-credit), and moving outside it (trash edits; draft channel rows
  // on forks that use them) counts nothing. Counter recalculation applies the same two
  // predicates in SQL and must agree.
  if (tableMeta.kind === 'entity' && organizationId) {
    const countAction = deriveCountAction(action, newRow, oldRow);
    const deltas = countAction ? getEntityDeltas(countAction, organizationId, tableMeta.type, newRow, oldRow, h) : [];

    // Activity stamps (epoch ms) at the home context only (deepest non-null ancestor, org
    // fallback). These per-stream signals stay at the home context and do not propagate to
    // higher ancestors like `e:` deltas. `li:<type>` moves forward when new content enters
    // the countable set — with the publication row filter a publish edge arrives as INSERT,
    // so the create IS the publish — and `lu:<type>` moves on countable-row content updates.
    // Deletes, soft-deletes and restores leave both untouched (a restore re-counts the row
    // but is old content, so no stamp); drafts never reach the stream.
    if (h.isProduct(tableMeta.type) && countAction !== null && countAction !== 'delete') {
      const stampKey =
        action === 'create' && countAction === 'create'
          ? `li:${tableMeta.type}`
          : countAction === 'update'
            ? `lu:${tableMeta.type}`
            : null;
      if (stampKey) {
        // li: prefers publishedAt so CDC and recalculation stamp the same instant on
        // draft-lifecycle tables (createdAt elsewhere); lu: is always updatedAt.
        const stampSource = stampKey.startsWith('li:')
          ? (getStringValue(newRow, 'publishedAt') ?? getStringValue(newRow, 'createdAt'))
          : getStringValue(newRow, 'updatedAt');
        const parsedMs = stampSource ? Date.parse(stampSource) : Number.NaN;
        deltas.push({
          channelKey: resolveDeepestAncestorId(h, tableMeta.type, newRow) ?? organizationId,
          deltas: { [stampKey]: Number.isNaN(parsedMs) ? Date.now() : parsedMs },
        });
      }
    }

    // Embedding counters: track e:<hostEntity> counts per embedded entity ID. Hosts are
    // always products (config type), so the publication row filter carries the draft
    // dimension: a publish edge arrives as INSERT (adds every ref), an unpublish as
    // DELETE with the old row (removes them), draft ref edits never arrive. The
    // deletedAt dimension is not remapped — soft-delete ref cleanup is owned by
    // embedding-cleanup, which rewrites the arrays and emits its own updates.
    for (const embedding of appConfig.entityEmbeddings) {
      if (embedding.hostEntity !== tableMeta.type) continue;
      const col = embedding.hostColumn;
      const counterKey = `e:${embedding.hostEntity}`;

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
    return role ? { channelKey: channelId, deltas: { [`m:${role}`]: 1, 'm:total': 1 } } : null;
  }

  if (action === 'delete') {
    const role = getStringValue(newRow, 'role');
    return role ? { channelKey: channelId, deltas: { [`m:${role}`]: -1, 'm:total': -1 } } : null;
  }

  if (action === 'update' && oldRow) {
    const oldRole = getStringValue(oldRow, 'role');
    const newRole = getStringValue(newRow, 'role');
    if (oldRole && newRole && oldRole !== newRole) {
      return { channelKey: channelId, deltas: { [`m:${oldRole}`]: -1, [`m:${newRole}`]: 1 } };
    }
  }

  return null;
}
/** Inactive membership m:pending delta; only rows with rejectedAt null count as pending. */
function getInactiveMembershipDelta(
  action: ActivityAction,
  newRow: CdcRowData,
  oldRow: CdcRowData | null,
): CountDelta | null {
  const channelId = getStringValue(newRow, 'channelId');
  if (!channelId) return null;

  if (action === 'create') {
    if (newRow.rejectedAt != null) return null;
    return { channelKey: channelId, deltas: { 'm:pending': 1 } };
  }

  if (action === 'delete') {
    const rejectedAt = newRow.rejectedAt ?? oldRow?.rejectedAt;
    if (rejectedAt != null) return null;
    return { channelKey: channelId, deltas: { 'm:pending': -1 } };
  }

  if (action === 'update' && oldRow) {
    const wasNull = oldRow.rejectedAt == null;
    const isNull = newRow.rejectedAt == null;
    if (wasNull && !isNull) {
      return { channelKey: channelId, deltas: { 'm:pending': -1 } };
    }
    if (!wasNull && isNull) {
      return { channelKey: channelId, deltas: { 'm:pending': 1 } };
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
  h: AncestorSource,
): CountDelta[] {
  if (!newRow.id) {
    log.warn(`getEntityDeltas: missing "id" for ${entityType}`, { action });
    return [];
  }

  const counterKey = `e:${entityType}`;
  const selfCountKey = `es:${entityType}`;

  if (action === 'create' || action === 'delete') {
    const value = action === 'create' ? 1 : -1;
    const row = action === 'delete' ? (oldRow ?? newRow) : newRow;
    const deltas: CountDelta[] = [{ channelKey: organizationId, deltas: { [counterKey]: value } }];
    for (const ancestor of resolveNonNullAncestors(h, entityType, row)) {
      if (ancestor.id === organizationId) continue; // org already counted above
      deltas.push({ channelKey: ancestor.id, deltas: { [counterKey]: value } });
    }
    // Self count: rows HOMED at the node only (deepest non-null ancestor, org fallback) —
    // the summary a self view is answered from (mirrors the li:/lu: placement rule).
    const home = resolveDeepestAncestorId(h, entityType, row) ?? organizationId;
    deltas.push({ channelKey: home, deltas: { [selfCountKey]: value } });
    warnMissingAncestors(h, entityType, row);
    return deltas;
  }

  // Plain update: ancestor ids may have changed (reparent / re-attach at another
  // depth), so diff old vs new and re-credit. The caller guarantees an 'update' here
  // is a countable→countable edge (both rows live and published); set-crossing edges
  // were already remapped to delete/create.
  if (action === 'update' && oldRow) {
    const oldIds = new Set(resolveNonNullAncestors(h, entityType, oldRow).map((a) => a.id));
    const newIds = new Set(resolveNonNullAncestors(h, entityType, newRow).map((a) => a.id));
    const deltas: CountDelta[] = [];
    for (const id of newIds) {
      if (!oldIds.has(id)) deltas.push({ channelKey: id, deltas: { [counterKey]: 1 } });
    }
    for (const id of oldIds) {
      if (!newIds.has(id)) deltas.push({ channelKey: id, deltas: { [counterKey]: -1 } });
    }
    // Reparent moves the self count between homes.
    const oldHome = resolveDeepestAncestorId(h, entityType, oldRow) ?? organizationId;
    const newHome = resolveDeepestAncestorId(h, entityType, newRow) ?? organizationId;
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
function warnMissingAncestors(h: AncestorSource, entityType: EntityType, row: CdcRowData): void {
  const nullable = h.getNullableAncestors(entityType);
  for (const ancestor of h.getOrderedAncestors(entityType)) {
    if (typeof row[`${ancestor}Id`] === 'string') continue;
    if (nullable.includes(ancestor)) continue;
    log.warn(`getEntityDeltas: missing "${ancestor}Id" for ${entityType}`, { id: row.id });
  }
}
