import { getTableName } from 'drizzle-orm';
import { hierarchy, resolveDeepestAncestorId } from 'shared';
import type { ActivityAction, AncestorSource } from 'shared';
import type { PendingEvent, TableMeta } from '../types';
import type { ActivityWithoutId } from '../pipeline/parse-message';
import type { CdcRowData } from '../types';
import { type CountsHierarchy, getCountDeltas, isActivityStampKey } from './update-counts';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Plan for a batch of CDC events: seq groups that need RETURNING,
 * accumulated count deltas, and entity stamp data.
 */
export interface BatchUnifiedDeltaPlan {
  /** Seq groups: each needs a sequential UPSERT with RETURNING to reserve a seq range. */
  seqGroups: SeqGroup[];
  /** All count deltas merged by channelKey (across all events, excluding seq deltas). */
  countDeltasByChannelKey: Map<string, Record<string, number>>;
  /** Entity rows to stamp with assigned seq values (bulk UPDATE ... FROM VALUES). */
  entityStamps: Array<{ tableName: string; id: string; seq: number }>;
}

export interface SeqGroup {
  channelKey: string;
  seqKey: string;
  count: number;
  /** Org key for signaling (null if ctx === org or no org). */
  orgSignal: { orgKey: string; seqKey: string; count: number } | null;
  /** Events in this group, for assigning seq values after RETURNING. */
  events: PendingEvent[];
  tableName: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the context key for a product entity from its row data: the row's deepest non-null
 * ancestor (variable-depth rows scope to their effective home, e.g. a course-stream item with
 * `projectId = null` scopes to its course). Without nullable ancestors this equals the
 * declared parent. Falls back to the activity's org for rows whose ancestor ids are all null.
 * The hierarchy model guarantees every product entity at least an organization, so a row
 * without one is a modeling error: fail the group loudly rather than invent a scope.
 */
export function resolveChannelKey(
  entityType: string,
  rowData: CdcRowData,
  activity: ActivityWithoutId,
  h: AncestorSource = hierarchy,
): string {
  const deepest = resolveDeepestAncestorId(h, entityType, rowData);
  if (deepest) return deepest;
  if (activity.organizationId) return activity.organizationId;
  throw new Error(`No context for ${entityType} row ${rowData.id}: the hierarchy model requires an organization ancestor`);
}

/**
 * Merge deltas into an existing map entry, summing values for matching keys.
 * `li:`/`lu:` keys are epoch-ms activity stamps, not deltas: collisions keep the max
 * (two posts in one batch must not sum their timestamps).
 */
function mergeDelta(map: Map<string, Record<string, number>>, channelKey: string, deltas: Record<string, number>): void {
  const existing = map.get(channelKey);
  if (existing) {
    for (const [k, v] of Object.entries(deltas)) {
      existing[k] = isActivityStampKey(k) ? Math.max(existing[k] ?? 0, v) : (existing[k] ?? 0) + v;
    }
  } else {
    map.set(channelKey, { ...deltas });
  }
}

/** Check if this event should get a seq stamp (product entity create/update). */
function isStampable(tableMeta: TableMeta, action: ActivityAction, h: CountsHierarchy): boolean {
  return tableMeta.kind === 'entity' && h.isProduct(tableMeta.type) && (action === 'create' || action === 'update');
}

// ── Batch ────────────────────────────────────────────────────────────────────

/**
 * Compute a unified delta plan for a batch of CDC events.
 * Reserves seq ranges per (channelKey, entityType), accumulates all count deltas.
 */
export function computeBatchUnifiedDeltas(events: PendingEvent[], h: CountsHierarchy = hierarchy): BatchUnifiedDeltaPlan {
  const countDeltasByChannelKey = new Map<string, Record<string, number>>();
  const seqGroupMap = new Map<string, SeqGroup>();
  const entityStamps: BatchUnifiedDeltaPlan['entityStamps'] = [];

  for (const event of events) {
    const { tableMeta, activity, rowData } = event.result;
    const { action } = activity;

    // Seq grouping (product entity create/update only)
    if (isStampable(tableMeta, action, h)) {
      const entityType = tableMeta.type;
      const ctxKey = resolveChannelKey(entityType, rowData, activity, h);
      const groupKey = `${ctxKey}\0${entityType}`;

      const existing = seqGroupMap.get(groupKey);
      if (existing) {
        existing.count++;
        existing.events.push(event);
      } else {
        const sKey = `s:${entityType}`;
        seqGroupMap.set(groupKey, {
          channelKey: ctxKey,
          seqKey: sKey,
          count: 1,
          orgSignal: activity.organizationId && ctxKey !== activity.organizationId
            ? { orgKey: activity.organizationId, seqKey: sKey, count: 0 }
            : null,
          events: [event],
          tableName: getTableName(tableMeta.table),
        });
      }
    }

    // Count deltas
    const countDeltas = getCountDeltas(tableMeta, activity, rowData, event.result.oldRowData, h);
    for (const { channelKey, deltas } of countDeltas) {
      mergeDelta(countDeltasByChannelKey, channelKey, deltas);
    }
  }

  // Finalize seq groups: set correct counts for org signals
  const seqGroups = Array.from(seqGroupMap.values());
  for (const group of seqGroups) {
    if (group.orgSignal) {
      group.orgSignal.count = group.count;
    }
  }

  return { seqGroups, countDeltasByChannelKey, entityStamps };
}
