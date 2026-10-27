import type { ActivityAction, EntityHierarchy } from 'shared';
import { hierarchy } from 'shared';
import { isMaxMergeKey } from '#/modules/entities/counter-keys';
import type { ActivityWithoutId } from '../pipeline/parse-message';
import type { CdcRowData, PendingEvent, TableMeta } from '../types';
import { getCountDeltas } from './update-counts';

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
  /** Stampable events in WAL order, one sequence value each; seq values are assigned after RETURNING. */
  events: PendingEvent[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Home key of a product row: its deepest populated ancestor, falling back to the activity
 * organization; a missing organization violates the hierarchy and throws. The key groups audiences,
 * activity stamps, and unseen counts, never sequence allocation.
 */
export function resolveChannelKey(entityType: string, rowData: CdcRowData, activity: ActivityWithoutId, h: EntityHierarchy = hierarchy): string {
  const deepest = h.resolveDeepestAncestorId(entityType, rowData);
  if (deepest) return deepest;
  if (activity.organizationId) return activity.organizationId;
  throw new Error(`No context for ${entityType} row ${rowData.id}: the hierarchy model requires an organization ancestor`);
}

/**
 * Channel-counter nodes a stamped row's frontier propagates to: the organization plus every non-null
 * ancestor, so `e:f:{type}` at any node answers "did anything of this type change at or below here".
 */
export function frontierNodeKeys(entityType: string, rowData: CdcRowData, organizationId: string, h: EntityHierarchy = hierarchy): string[] {
  const nodes = [organizationId];
  for (const ancestor of h.resolveNonNullAncestors(entityType, rowData)) {
    if (ancestor.id !== organizationId) nodes.push(ancestor.id);
  }
  return nodes;
}

/** Merges deltas into those of a channel key: a count adds up, a stamp or a frontier keeps the highest value. */
export function mergeDelta(map: Map<string, Record<string, number>>, channelKey: string, deltas: Record<string, number>): void {
  const existing = map.get(channelKey);
  if (existing) {
    for (const [k, v] of Object.entries(deltas)) {
      existing[k] = isMaxMergeKey(k) ? Math.max(existing[k] ?? 0, v) : (existing[k] ?? 0) + v;
    }
  } else {
    map.set(channelKey, { ...deltas });
  }
}

/** Whether a change gets a sequence value: the create or the update of a product row. */
export function isStampable(tableMeta: TableMeta, action: ActivityAction, h: EntityHierarchy): boolean {
  return tableMeta.kind === 'entity' && h.isProduct(tableMeta.type) && (action === 'create' || action === 'update');
}

/** The organization a stampable change reserves its sequence value from; a change without one violates the hierarchy. */
function organizationOf({ result: { tableMeta, activity, rowData } }: PendingEvent): string {
  if (!activity.organizationId) {
    throw new Error(`No organization for ${tableMeta.type} row ${rowData.id}: the hierarchy model requires an organization ancestor`);
  }
  return activity.organizationId;
}

/**
 * Reserves one sequence range per organization, shared by all product entity types and preserving WAL
 * order, and accumulates count deltas. Frontier (`e:f:`) deltas wait until seq values are assigned.
 */
export function computeBatchUnifiedDeltas(events: PendingEvent[], h: EntityHierarchy = hierarchy): BatchUnifiedDeltaPlan {
  const stamped = events.filter(({ result }) => isStampable(result.tableMeta, result.activity.action, h));
  const orgSequenceGroups = [...Map.groupBy(stamped, organizationOf)].map(([orgKey, group]) => ({ orgKey, events: group }));

  const countDeltasByChannelKey = new Map<string, Record<string, number>>();
  for (const { result, cascadeCounts } of events) {
    for (const { channelKey, deltas } of getCountDeltas(result.tableMeta, result.activity, result.rowData, result.oldRowData, h)) {
      mergeDelta(countDeltasByChannelKey, channelKey, deltas);
    }
    // The rows a channel delete took with it: their own deletes were suppressed, and this change carries their counts.
    for (const [channelKey, deltas] of cascadeCounts ?? []) mergeDelta(countDeltasByChannelKey, channelKey, deltas);
  }

  return { orgSequenceGroups, countDeltasByChannelKey };
}
