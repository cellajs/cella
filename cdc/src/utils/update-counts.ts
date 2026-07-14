import { appConfig, hierarchy, resolveDeepestAncestorId, resolveNonNullAncestors } from 'shared';
import type { ActivityAction, AncestorSource } from 'shared';
import type { ActivityWithoutId } from '../pipeline/parse-message';
import type { TableMeta } from '../types';
import type { CdcRowData } from '../types';
import { isRestoreTransition, isSoftDeleteTransition } from './is-soft-delete-transition';
import { log } from '../lib/pino';

export interface CountDelta {
  /** Context key (organizationId or sub-context id): the row to update */
  channelKey: string;
  /**
   * Key-value deltas: e.g. { 'm:admin': 1, 'm:total': 1 } or { 'e:attachment': -1 }.
   * `li:<type>` / `lu:<type>` keys carry an epoch-ms activity stamp instead of a delta; they merge via max.
   */
  deltas: Record<string, number>;
}

/** Hierarchy surface the counter machinery needs; injectable for synthetic-hierarchy tests. */
export type CountsHierarchy = AncestorSource & {
  isProduct(entityType: string): boolean;
};

/**
 * `li:<type>` (last insert) / `lu:<type>` (last update) keys carry epoch-ms activity
 * stamps instead of deltas: they merge via max, never sum. Mirrored by the
 * apply_count_deltas PG function.
 */
export function isActivityStampKey(key: string): boolean {
  return key.startsWith('li:') || key.startsWith('lu:');
}

/**
 * Determine count deltas from a CDC event.
 *
 * Membership rows yield `m:<role>` / `m:total` deltas plus an org-level
 * `s:membership` seq bump used for catchup change screening. Inactive
 * memberships count as `m:pending` while rejectedAt is null. Entity rows yield
 * `e:<type>` deltas on the org and every non-null ancestor context; updates
 * that change ancestor ids re-credit the counters. Product rows also stamp
 * `li:<type>` (last insert) / `lu:<type>` (last update) epoch ms at their home
 * context only.
 */
export function getCountDeltas(
  tableMeta: TableMeta,
  activity: ActivityWithoutId,
  newRow: CdcRowData,
  oldRow: CdcRowData | null,
  h: CountsHierarchy = hierarchy,
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
    if (organizationId) deltas.push({ channelKey: organizationId, deltas: { 's:membership': 1 } });
    return deltas;
  }

  // Entities: track entity type counts on org + non-null ancestor contexts.
  // Soft-delete/restore transitions count as delete/create (live rows only, like recalculation).
  if (tableMeta.kind === 'entity' && organizationId) {
    const countAction = isSoftDeleteTransition(newRow, oldRow)
      ? 'delete'
      : isRestoreTransition(newRow, oldRow)
        ? 'create'
        : action;
    const deltas = getEntityDeltas(countAction, organizationId, tableMeta.type, newRow, oldRow, h);

    // Activity stamps (epoch ms) at the home context only (deepest non-null ancestor, org
    // fallback) — deliberately NOT propagated to higher ancestors like `e:` deltas; they are
    // per-stream signals. `li:<type>` moves forward on true INSERTs only; `lu:<type>` on
    // genuine live-row content updates. Deletes, soft-deletes, restores and updates to
    // trashed rows leave both untouched, as do draft rows (author-only fork rows; the
    // template has no draft column, so that condition is simply never met).
    if (h.isProduct(tableMeta.type) && newRow.draft !== true) {
      const stampKey =
        action === 'create'
          ? `li:${tableMeta.type}`
          : countAction === 'update' && newRow.deletedAt == null
            ? `lu:${tableMeta.type}`
            : null;
      if (stampKey) {
        const stampSource = getStringValue(newRow, action === 'create' ? 'createdAt' : 'updatedAt');
        const parsedMs = stampSource ? Date.parse(stampSource) : Number.NaN;
        deltas.push({
          channelKey: resolveDeepestAncestorId(h, tableMeta.type, newRow) ?? organizationId,
          deltas: { [stampKey]: Number.isNaN(parsedMs) ? Date.now() : parsedMs },
        });
      }
    }

    // Embedding counters: track e:<hostEntity> counts per embedded entity ID
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
 * Soft-delete and restore transitions are remapped to delete/create by the caller.
 */
function getEntityDeltas(
  action: ActivityAction,
  organizationId: string,
  entityType: string,
  newRow: CdcRowData,
  oldRow: CdcRowData | null,
  h: AncestorSource,
): CountDelta[] {
  if (!newRow.id) {
    log.warn(`getEntityDeltas: missing "id" for ${entityType}`, { action });
    return [];
  }

  const counterKey = `e:${entityType}`;

  if (action === 'create' || action === 'delete') {
    const value = action === 'create' ? 1 : -1;
    const row = action === 'delete' ? (oldRow ?? newRow) : newRow;
    const deltas: CountDelta[] = [{ channelKey: organizationId, deltas: { [counterKey]: value } }];
    for (const ancestor of resolveNonNullAncestors(h, entityType, row)) {
      if (ancestor.id === organizationId) continue; // org already counted above
      deltas.push({ channelKey: ancestor.id, deltas: { [counterKey]: value } });
    }
    warnMissingAncestors(h, entityType, row);
    return deltas;
  }

  // Plain update: ancestor ids may have changed (reparent / re-attach at another
  // depth), so diff old vs new and re-credit. Only live→live moves counters: a
  // soft-deleted row is not counted anywhere, and soft-delete/restore transitions
  // were already remapped to delete/create by the caller.
  if (action === 'update' && oldRow && newRow.deletedAt == null && oldRow.deletedAt == null) {
    const oldIds = new Set(resolveNonNullAncestors(h, entityType, oldRow).map((a) => a.id));
    const newIds = new Set(resolveNonNullAncestors(h, entityType, newRow).map((a) => a.id));
    const deltas: CountDelta[] = [];
    for (const id of newIds) {
      if (!oldIds.has(id)) deltas.push({ channelKey: id, deltas: { [counterKey]: 1 } });
    }
    for (const id of oldIds) {
      if (!newIds.has(id)) deltas.push({ channelKey: id, deltas: { [counterKey]: -1 } });
    }
    return deltas;
  }

  return [];
}

/**
 * Warn for missing ancestor ids, except ancestors declared nullable (variable-depth rows).
 */
function warnMissingAncestors(h: AncestorSource, entityType: string, row: CdcRowData): void {
  const nullable = h.getNullableAncestors(entityType);
  for (const ancestor of h.getOrderedAncestors(entityType)) {
    if (typeof row[`${ancestor}Id`] === 'string') continue;
    if (nullable.includes(ancestor)) continue;
    log.warn(`getEntityDeltas: missing "${ancestor}Id" for ${entityType}`, { id: row.id });
  }
}
