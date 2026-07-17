import type { GetUnseenCountsResponse } from 'sdk';
import type { ProductEntityType } from 'shared';
import { seenKeys } from '~/modules/seen/helpers';
import { queryClient } from '~/query/query-client';

/**
 * Batched ± patching of the unseen-counts query cache.
 *
 * Each `setQueryData` fires a cache event that makes PersistQueryClientProvider dehydrate the
 * entire cache — real main-thread jank with hundreds of cached queries, while SeenMark observers
 * fire per frame during scroll. Deltas therefore accumulate and apply as a single `setQueryData`
 * per idle callback. Counts clamp at 0; the periodic exact recount absorbs residual drift.
 */
const pendingDeltas: { channelId: string; entityType: ProductEntityType; delta: number }[] = [];
let flushScheduled = false;

/** Max delay before forcing a flush when the browser never goes idle */
const MAX_DELAY_MS = 5000;

const scheduleIdle =
  typeof requestIdleCallback === 'function'
    ? (cb: () => void) => requestIdleCallback(cb, { timeout: MAX_DELAY_MS })
    : (cb: () => void) => setTimeout(cb, MAX_DELAY_MS);

/** Queue a ± adjustment to a channel's unseen count */
export function applyUnseenDelta(channelId: string, entityType: ProductEntityType, delta: number) {
  pendingDeltas.push({ channelId, entityType, delta });
  if (flushScheduled) return;
  flushScheduled = true;
  scheduleIdle(flushDeltas);
}

function flushDeltas() {
  flushScheduled = false;
  if (pendingDeltas.length === 0) return;
  const batch = pendingDeltas.splice(0);

  queryClient.setQueryData<GetUnseenCountsResponse>(seenKeys.unseenCounts, (old) => {
    if (!old) return old;
    const updated = { ...old };

    for (const { channelId, entityType, delta } of batch) {
      const next = Math.max(0, (updated[channelId]?.[entityType] ?? 0) + delta);
      if (next > 0) {
        updated[channelId] = { ...updated[channelId], [entityType]: next };
      } else if (updated[channelId]) {
        const { [entityType]: _, ...rest } = updated[channelId];
        if (Object.keys(rest).length === 0) delete updated[channelId];
        else updated[channelId] = rest;
      }
    }
    return updated;
  });
}
