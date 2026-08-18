import type { ActivityAction, EntityHierarchy } from 'shared';
import { hierarchy } from 'shared';
import type { ActivityWithoutId } from '../pipeline/parse-message';
import type { CdcRowData, PendingEvent, TableMeta } from '../types';
import { getCountDeltas, isMaxMergeKey } from './update-counts';

// ── Types ────────────────────────────────────────────────────────────────────

/** One sequence group per organization (reserved by RETURNING UPSERT) plus accumulated count deltas. */
export interface BatchUnifiedDeltaPlan {
  /** One per organization: reserves `sequence` and stamps its events in WAL order. */
  orgSequenceGroups: OrgSequenceGroup[];
  /** Merged across all events by channelKey; excludes sequence and frontier deltas. */
  countDeltasByChannelKey: Map<string, Record<string, number>>;
}

export interface OrgSequenceGroup {
  /** The organization whose sequence this group reserves from. */
  orgKey: string;
  /** Number of stampable events (sequence values to reserve). */
  count: number;
  /** Stampable events in WAL order; seq values are assigned after RETURNING. */
  events: PendingEvent[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Home key of a product row: its deepest populated ancestor, falling back to the activity
 * organization; a missing organization violates the hierarchy and throws. The key groups audiences,
 * activity stamps, and unseen counts, never sequence allocation.
 */
export function resolveChannelKey(
  entityType: string,
  rowData: CdcRowData,
  activity: ActivityWithoutId,
  h: EntityHierarchy = hierarchy,
): string {
  const deepest = h.resolveDeepestAncestorId(entityType, rowData);
  if (deepest) return deepest;
  if (activity.organizationId) return activity.organizationId;
  throw new Error(
    `No context for ${entityType} row ${rowData.id}: the hierarchy model requires an organization ancestor`,
  );
}

/**
 * Channel-counter nodes a stamped row's frontier propagates to: the organization plus every non-null
 * ancestor, so `e:f:{type}` at any node answers "did anything of this type change at or below here".
 */
export function frontierNodeKeys(
  entityType: string,
  rowData: CdcRowData,
  organizationId: string,
  h: EntityHierarchy = hierarchy,
): string[] {
  const nodes = [organizationId];
  for (const ancestor of h.resolveNonNullAncestors(entityType, rowData)) {
    if (ancestor.id !== organizationId) nodes.push(ancestor.id);
  }
  return nodes;
}

/** Sums matching keys; max-merge keys keep the max, since stamps and frontiers must never sum. */
export function mergeDelta(
  map: Map<string, Record<string, number>>,
  channelKey: string,
  deltas: Record<string, number>,
): void {
  const existing = map.get(channelKey);
  if (existing) {
    for (const [k, v] of Object.entries(deltas)) {
      existing[k] = isMaxMergeKey(k) ? Math.max(existing[k] ?? 0, v) : (existing[k] ?? 0) + v;
    }
  } else {
    map.set(channelKey, { ...deltas });
  }
}

function isStampable(tableMeta: TableMeta, action: ActivityAction, h: EntityHierarchy): boolean {
  return tableMeta.kind === 'entity' && h.isProduct(tableMeta.type) && (action === 'create' || action === 'update');
}

/**
 * Reserves one sequence range per organization, shared by all product entity types and preserving WAL
 * order, and accumulates count deltas. Frontier (`e:f:`) deltas wait until seq values are assigned.
 */
export function computeBatchUnifiedDeltas(
  events: PendingEvent[],
  h: EntityHierarchy = hierarchy,
): BatchUnifiedDeltaPlan {
  const countDeltasByChannelKey = new Map<string, Record<string, number>>();
  const orgSequenceGroupMap = new Map<string, OrgSequenceGroup>();

  for (const event of events) {
    const { tableMeta, activity, rowData } = event.result;
    const { action } = activity;

    if (isStampable(tableMeta, action, h)) {
      const orgKey = activity.organizationId;
      if (!orgKey) {
        throw new Error(
          `No organization for ${tableMeta.type} row ${rowData.id}: the hierarchy model requires an organization ancestor`,
        );
      }
      const existing = orgSequenceGroupMap.get(orgKey);
      if (existing) {
        existing.count++;
        existing.events.push(event);
      } else {
        orgSequenceGroupMap.set(orgKey, { orgKey, count: 1, events: [event] });
      }
    }

    const countDeltas = getCountDeltas(tableMeta, activity, rowData, event.result.oldRowData, h);
    for (const { channelKey, deltas } of countDeltas) {
      mergeDelta(countDeltasByChannelKey, channelKey, deltas);
    }
  }

  return { orgSequenceGroups: Array.from(orgSequenceGroupMap.values()), countDeltasByChannelKey };
}
