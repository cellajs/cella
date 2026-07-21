import { hierarchy, type ProductEntityType, resolveDeepestAncestorId, seenWindowMs } from 'shared';
import { isSeenTracked, matchesUnseenFilters, seenKeys } from '~/modules/seen/helpers';
import { isSeenLocally } from '~/modules/seen/seen-store';
import { applyUnseenDelta } from '~/modules/seen/unseen-delta';
import { queryClient } from '~/query/query-client';

/*
 * Exact unseen-count deltas derived from synced rows, valid between two exact server recounts.
 *
 * `countedIds` holds rows counted (+1) since the last recount, so a row appearing in several
 * synced ranges (created, then updated) counts once. Rows whose recency (publish time on
 * draft-lifecycle rows, else created time) predates `lastReconcileAt` are already in the
 * server's counts and are never re-counted.
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
  productType: ProductEntityType,
  fallbackChannelId: string,
  rows: { id: string; [key: string]: unknown }[],
): void {
  if (!isSeenTracked(productType)) return;
  const cutoff = Date.now() - seenWindowMs;

  for (const row of rows) {
    // Draft-lifecycle rows use publish time for recency (publishedAt ?? createdAt), matching
    // the server's unseen window key in `findUnseenCountsByUser`. Publishing an old draft
    // still counts as new.
    const recencySource =
      (typeof row.publishedAt === 'string' ? row.publishedAt : undefined) ??
      (typeof row.createdAt === 'string' ? row.createdAt : undefined);
    const recencyAt = recencySource ? Date.parse(recencySource) : Number.NaN;
    if (Number.isNaN(recencyAt) || recencyAt <= cutoff) continue;
    if (!matchesUnseenFilters(productType, row)) continue;

    const channelId = resolveDeepestAncestorId(hierarchy, productType, row) ?? fallbackChannelId;
    const seen = isSeenLocally(row.id);

    if (typeof row.deletedAt === 'string' && row.deletedAt.length > 0) {
      // Decrement only rows the current count can include: counted here, or in the server
      // baseline (recency before the last recount).
      if (!seen && (countedIds.has(row.id) || recencyAt <= lastReconcileAt))
        applyUnseenDelta(channelId, productType, -1);
      countedIds.delete(row.id);
    } else if (recencyAt > lastReconcileAt && !seen && !countedIds.has(row.id)) {
      countedIds.add(row.id);
      applyUnseenDelta(channelId, productType, 1);
    }
  }
}

/** Removal without a tombstone row: a locally-seen entity nets 0 (total −1, seen −1); an unseen one decrements. */
export function applyUnfetchableRemovalUnseen(
  productType: ProductEntityType,
  entityId: string,
  channelId: string | null,
): void {
  if (!isSeenTracked(productType)) return;
  countedIds.delete(entityId);
  if (isSeenLocally(entityId)) return;
  if (channelId) applyUnseenDelta(channelId, productType, -1);
  else queryClient.invalidateQueries({ queryKey: seenKeys.unseenCounts });
}
