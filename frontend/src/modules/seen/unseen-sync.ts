import { hierarchy, type ProductEntityType, resolveDeepestAncestorId, seenWindowMs } from 'shared';
import { isSeenTracked, matchesUnseenFilters, seenKeys } from '~/modules/seen/helpers';
import { isSeenLocally } from '~/modules/seen/seen-store';
import { applyUnseenDelta } from '~/modules/seen/unseen-delta';
import { queryClient } from '~/query/query-client';

/*
 * Exact unseen-count deltas derived from synced rows, valid between two exact server recounts.
 *
 * `countedIds` holds rows counted (+1) since the last recount, so a row appearing in several
 * synced ranges (created, then updated) counts once. Rows created before `lastReconcileAt` are
 * already in the server's counts and are never re-counted.
 */
const countedIds = new Set<string>();
// Session start doubles as the first recount point: a persisted counts cache may restore before the first refetch.
let lastReconcileAt = Date.now();

/** An exact server recount replaced the cached counts: restart delta tracking from now. */
export function noteUnseenReconciled(): void {
  countedIds.clear();
  lastReconcileAt = Date.now();
}

/**
 * Apply badge deltas for the rows a synced seq range delivered: new-and-unseen rows +1,
 * tombstoned-and-unseen rows −1. Applies the same row filters as the server's
 * `findUnseenCountsByUser`; forks add theirs in `matchesUnseenFilters` (helpers.ts).
 */
export function ingestSyncedRows(
  entityType: ProductEntityType,
  fallbackChannelId: string,
  rows: { id: string; [key: string]: unknown }[],
): void {
  if (!isSeenTracked(entityType)) return;
  const cutoff = Date.now() - seenWindowMs;

  for (const row of rows) {
    const createdAt = typeof row.createdAt === 'string' ? Date.parse(row.createdAt) : Number.NaN;
    if (Number.isNaN(createdAt) || createdAt <= cutoff) continue;
    if (!matchesUnseenFilters(entityType, row)) continue;

    const channelId = resolveDeepestAncestorId(hierarchy, entityType, row) ?? fallbackChannelId;
    const seen = isSeenLocally(row.id);

    if (typeof row.deletedAt === 'string' && row.deletedAt.length > 0) {
      // Decrement only rows the current count can include: counted here, or in the server
      // baseline (created before the last recount).
      if (!seen && (countedIds.has(row.id) || createdAt <= lastReconcileAt))
        applyUnseenDelta(channelId, entityType, -1);
      countedIds.delete(row.id);
    } else if (createdAt > lastReconcileAt && !seen && !countedIds.has(row.id)) {
      countedIds.add(row.id);
      applyUnseenDelta(channelId, entityType, 1);
    }
  }
}

/** Hard delete (no tombstone row to ingest): a locally-seen entity nets 0 (total −1, seen −1); an unseen one decrements. */
export function applyHardDeleteUnseen(entityType: ProductEntityType, entityId: string, channelId: string | null): void {
  if (!isSeenTracked(entityType)) return;
  countedIds.delete(entityId);
  if (isSeenLocally(entityId)) return;
  if (channelId) applyUnseenDelta(channelId, entityType, -1);
  else queryClient.invalidateQueries({ queryKey: seenKeys.unseenCounts });
}
