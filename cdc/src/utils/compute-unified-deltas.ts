import { hierarchy, resolveDeepestAncestorId, resolveNonNullAncestors } from 'shared';
import type { ActivityAction, AncestorSource } from 'shared';
import type { PendingEvent, TableMeta } from '../types';
import type { ActivityWithoutId } from '../pipeline/parse-message';
import type { CdcRowData } from '../types';
import { type CountsHierarchy, getCountDeltas, isMaxMergeKey } from './update-counts';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Plan for a batch of CDC events: one ledger group per organization (needs a RETURNING
 * UPSERT to reserve a contiguous org-ledger range) plus accumulated count deltas.
 */
export interface BatchUnifiedDeltaPlan {
  /** One per organization: reserves `s:ledger` and stamps its events in WAL order. */
  ledgerGroups: LedgerGroup[];
  /** All count deltas merged by channelKey (across all events, excluding ledger/frontier deltas). */
  countDeltasByChannelKey: Map<string, Record<string, number>>;
}

export interface LedgerGroup {
  /** The organization whose ledger this group reserves from. */
  orgKey: string;
  /** Number of stampable events (ledger values to reserve). */
  count: number;
  /** Stampable events in WAL order; seq values are assigned after RETURNING. */
  events: PendingEvent[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the channel key for a product entity from its row data: the row's deepest non-null
 * ancestor (variable-depth rows scope to their effective home, e.g. a course-stream item with
 * `projectId = null` scopes to its course). Without nullable ancestors this equals the
 * declared parent. Falls back to the activity's org for rows whose ancestor ids are all null.
 * The hierarchy model guarantees every product entity at least an organization, so a row
 * without one is a modeling error, so the group fails loudly without inventing a scope.
 *
 * Under the org ledger this no longer scopes seq allocation; it remains the audience/home
 * grouping rule (message grouping fallback, activity stamps, unseen grouping).
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
 * The channel-counter nodes a stamped row's frontier propagates to: the organization
 * plus every non-null ancestor. This is the rollup set — `f:{type}` at any node answers
 * "did anything of this type change at or below here" with one comparison.
 */
export function frontierNodeKeys(
  entityType: string,
  rowData: CdcRowData,
  organizationId: string,
  h: AncestorSource = hierarchy,
): string[] {
  const nodes = [organizationId];
  for (const ancestor of resolveNonNullAncestors(h, entityType, rowData)) {
    if (ancestor.id !== organizationId) nodes.push(ancestor.id);
  }
  return nodes;
}

/**
 * Merge deltas into an existing map entry, summing values for matching keys.
 * Max-merge keys (`li:`/`lu:` stamps, `f:` frontiers) keep the max on collision
 * (two posts in one batch must not sum their timestamps or watermarks).
 */
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

/** Check if this event should get a ledger stamp (product entity create/update). */
function isStampable(tableMeta: TableMeta, action: ActivityAction, h: CountsHierarchy): boolean {
  return tableMeta.kind === 'entity' && h.isProduct(tableMeta.type) && (action === 'create' || action === 'update');
}

// ── Batch ────────────────────────────────────────────────────────────────────

/**
 * Compute a unified delta plan for a batch of CDC events.
 * Reserves one org-ledger range per organization (all product entity types share the
 * ledger; WAL order within the batch is preserved), accumulates all count deltas.
 * Frontier (`f:`) deltas are emitted at apply time, once ledger values are assigned.
 */
export function computeBatchUnifiedDeltas(events: PendingEvent[], h: CountsHierarchy = hierarchy): BatchUnifiedDeltaPlan {
  const countDeltasByChannelKey = new Map<string, Record<string, number>>();
  const ledgerGroupMap = new Map<string, LedgerGroup>();

  for (const event of events) {
    const { tableMeta, activity, rowData } = event.result;
    const { action } = activity;

    // Ledger grouping (product entity create/update only): one group per organization.
    if (isStampable(tableMeta, action, h)) {
      const orgKey = activity.organizationId;
      if (!orgKey) {
        throw new Error(
          `No organization for ${tableMeta.type} row ${rowData.id}: the hierarchy model requires an organization ancestor`,
        );
      }
      const existing = ledgerGroupMap.get(orgKey);
      if (existing) {
        existing.count++;
        existing.events.push(event);
      } else {
        ledgerGroupMap.set(orgKey, { orgKey, count: 1, events: [event] });
      }
    }

    // Count deltas
    const countDeltas = getCountDeltas(tableMeta, activity, rowData, event.result.oldRowData, h);
    for (const { channelKey, deltas } of countDeltas) {
      mergeDelta(countDeltasByChannelKey, channelKey, deltas);
    }
  }

  return { ledgerGroups: Array.from(ledgerGroupMap.values()), countDeltasByChannelKey };
}
