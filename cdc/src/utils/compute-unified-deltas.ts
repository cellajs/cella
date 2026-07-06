import { getTableName } from 'drizzle-orm';
import { appConfig, hierarchy, isProductEntity } from 'shared';
import type { ActivityAction } from 'shared';
import type { PendingEvent, TableMeta } from '../types';
import type { ActivityWithoutId, ParseMessageResult } from '../pipeline/parse-message';
import type { CdcRowData } from '../types';
import { getCountDeltas } from './update-counts';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Plan for a single CDC event: all counter deltas merged by contextKey,
 * plus optional seq stamp metadata.
 */
export interface UnifiedDeltaPlan {
  /** Context key that needs RETURNING (parent context for seq). Null if no seq stamp needed. */
  seqContextKey: string | null;
  /** Seq counter key, e.g. 's:task'. Null if no seq stamp. */
  seqKey: string | null;
  /** Entity row to stamp with the new seq value. Null if no seq stamp. */
  entityStamp: { tableName: string; entityId: string } | null;
  /** All deltas grouped by contextKey — seq and count deltas merged per row. */
  deltasByContextKey: Map<string, Record<string, number>>;
}

/**
 * Plan for a batch of CDC events: seq groups that need RETURNING,
 * accumulated count deltas, and entity stamp data.
 */
export interface BatchUnifiedDeltaPlan {
  /** Seq groups: each needs a sequential UPSERT with RETURNING to reserve a seq range. */
  seqGroups: SeqGroup[];
  /** All count deltas merged by contextKey (across all events, excluding seq deltas). */
  countDeltasByContextKey: Map<string, Record<string, number>>;
  /** Entity rows to stamp with assigned seq values (bulk UPDATE ... FROM VALUES). */
  entityStamps: Array<{ tableName: string; id: string; seq: number }>;
}

export interface SeqGroup {
  contextKey: string;
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
 * Resolve the context key for a product entity from its row data.
 * Uses hierarchy to find the parent context (e.g., project) or falls back to org.
 * Returns null when neither is present (malformed row) — callers skip seq deltas.
 */
export function resolveContextKey(entityType: string, rowData: CdcRowData, activity: ActivityWithoutId): string | null {
  const parentType = hierarchy.getParent(entityType);
  if (parentType) {
    const parentIdKey = appConfig.entityIdColumnKeys[parentType];
    const parentId = rowData[parentIdKey];
    if (typeof parentId === 'string') return parentId;
  }

  return activity.organizationId ?? null;
}

/** Merge deltas into an existing map entry, summing values for matching keys. */
function mergeDelta(map: Map<string, Record<string, number>>, contextKey: string, deltas: Record<string, number>): void {
  const existing = map.get(contextKey);
  if (existing) {
    for (const [k, v] of Object.entries(deltas)) {
      existing[k] = (existing[k] ?? 0) + v;
    }
  } else {
    map.set(contextKey, { ...deltas });
  }
}

/** Check if this event should get a seq stamp (product entity create/update). */
function isStampable(tableMeta: TableMeta, action: ActivityAction): boolean {
  return tableMeta.kind === 'entity' && isProductEntity(tableMeta.type) && (action === 'create' || action === 'update');
}

// ── Single event ─────────────────────────────────────────────────────────────

/**
 * Compute a unified delta plan for a single CDC event.
 * Merges seq deltas and count deltas by contextKey so each row is UPSERTed once.
 */
export function computeUnifiedDeltas(result: ParseMessageResult): UnifiedDeltaPlan {
  const { tableMeta, activity, rowData, oldRowData } = result;
  const { action } = activity;
  const deltasByContextKey = new Map<string, Record<string, number>>();
  let seqContextKey: string | null = null;
  let seqKey: string | null = null;
  let entityStamp: UnifiedDeltaPlan['entityStamp'] = null;

  // Seq deltas (product entity create/update only; skipped when no context is resolvable)
  const stampCtxKey = isStampable(tableMeta, action) ? resolveContextKey(tableMeta.type, rowData, activity) : null;
  if (isStampable(tableMeta, action) && stampCtxKey) {
    const entityType = tableMeta.type;
    const ctxKey = stampCtxKey;
    seqKey = `s:${entityType}`;
    seqContextKey = ctxKey;
    entityStamp = { tableName: getTableName(tableMeta.table), entityId: rowData.id };

    // Parent-context seq delta
    mergeDelta(deltasByContextKey, ctxKey, { [seqKey]: 1 });

    // Org-level seq signal (skip if ctx === org or no org)
    if (activity.organizationId && ctxKey !== activity.organizationId) {
      mergeDelta(deltasByContextKey, activity.organizationId, { [seqKey]: 1 });
    }
  }

  // Count deltas (entity counts, membership counts, embedding counts)
  const countDeltas = getCountDeltas(tableMeta, activity, rowData, oldRowData);
  for (const { contextKey, deltas } of countDeltas) {
    mergeDelta(deltasByContextKey, contextKey, deltas);
  }

  return { seqContextKey, seqKey, entityStamp, deltasByContextKey };
}

// ── Batch ────────────────────────────────────────────────────────────────────

/**
 * Compute a unified delta plan for a batch of CDC events.
 * Reserves seq ranges per (contextKey, entityType), accumulates all count deltas.
 */
export function computeBatchUnifiedDeltas(events: PendingEvent[]): BatchUnifiedDeltaPlan {
  const countDeltasByContextKey = new Map<string, Record<string, number>>();
  const seqGroupMap = new Map<string, SeqGroup>();
  const entityStamps: BatchUnifiedDeltaPlan['entityStamps'] = [];

  for (const event of events) {
    const { tableMeta, activity, rowData } = event.result;
    const { action } = activity;

    // Seq grouping (product entity create/update only; skipped when no context is resolvable)
    const groupCtxKey = isStampable(tableMeta, action) ? resolveContextKey(tableMeta.type, rowData, activity) : null;
    if (isStampable(tableMeta, action) && groupCtxKey) {
      const entityType = tableMeta.type;
      const ctxKey = groupCtxKey;
      const groupKey = `${ctxKey}\0${entityType}`;

      const existing = seqGroupMap.get(groupKey);
      if (existing) {
        existing.count++;
        existing.events.push(event);
      } else {
        const sKey = `s:${entityType}`;
        seqGroupMap.set(groupKey, {
          contextKey: ctxKey,
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
    const countDeltas = getCountDeltas(tableMeta, activity, rowData, event.result.oldRowData);
    for (const { contextKey, deltas } of countDeltas) {
      mergeDelta(countDeltasByContextKey, contextKey, deltas);
    }
  }

  // Finalize seq groups: set correct counts for org signals
  const seqGroups = Array.from(seqGroupMap.values());
  for (const group of seqGroups) {
    if (group.orgSignal) {
      group.orgSignal.count = group.count;
    }
  }

  return { seqGroups, countDeltasByContextKey, entityStamps };
}
