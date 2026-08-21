import { hierarchy, type ProductEntityType, seenWindowMs } from 'shared';
import { isSeenTracked, matchesUnseenFilters, seenKeys } from '~/modules/seen/helpers';
import { isSeenLocally } from '~/modules/seen/seen-store';
import { applyUnseenDelta } from '~/modules/seen/unseen-delta';
import { queryClient } from '~/query/query-client';
import { onSyncedRows } from '~/query/realtime/sync-signals';

// Each synced row counts once between exact recounts; older rows are already in the server count.
const countedIds = new Set<string>();
// Session start is the first anchor: a persisted counts cache can restore before the first refetch.
let lastReconcileAt = Date.now();

export function noteUnseenReconciled(): void {
  countedIds.clear();
  lastReconcileAt = Date.now();
}

/** Badge deltas for a synced seq range: new-and-unseen rows +1, tombstoned-and-unseen rows -1, under the server's `findUnseenCountsByUser` filters. */
export function ingestSyncedRows(
  productType: ProductEntityType,
  fallbackChannelId: string,
  rows: { id: string; [key: string]: unknown }[],
): void {
  if (!isSeenTracked(productType)) return;
  const cutoff = Date.now() - seenWindowMs;

  for (const row of rows) {
    // Recency is `publishedAt ?? createdAt`, matching the server's unseen window key: publishing an old draft counts as new.
    const recencySource =
      (typeof row.publishedAt === 'string' ? row.publishedAt : undefined) ??
      (typeof row.createdAt === 'string' ? row.createdAt : undefined);
    const recencyAt = recencySource ? Date.parse(recencySource) : Number.NaN;
    if (Number.isNaN(recencyAt) || recencyAt <= cutoff) continue;
    if (!matchesUnseenFilters(productType, row)) continue;

    const channelId = hierarchy.resolveDeepestAncestorId(productType, row) ?? fallbackChannelId;
    const seen = isSeenLocally(row.id);

    if (typeof row.deletedAt === 'string' && row.deletedAt.length > 0) {
      // Decrement only rows the current count can include: counted here, or in the server baseline.
      if (!seen && (countedIds.has(row.id) || recencyAt <= lastReconcileAt))
        applyUnseenDelta(channelId, productType, -1);
      countedIds.delete(row.id);
    } else if (recencyAt > lastReconcileAt && !seen && !countedIds.has(row.id)) {
      countedIds.add(row.id);
      applyUnseenDelta(channelId, productType, 1);
    }
  }
}

/** Feeds every delivered sequence range into {@link ingestSyncedRows}; a degraded range carries no rows and the exact recount owns it. */
export function subscribeUnseenSync(): () => void {
  return onSyncedRows(({ entityType, organizationId, rows, degraded }) => {
    if (!degraded) ingestSyncedRows(entityType, organizationId, rows);
  });
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
