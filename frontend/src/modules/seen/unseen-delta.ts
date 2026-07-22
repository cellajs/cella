import type { GetUnseenCountsResponse } from 'sdk';
import type { ProductEntityType } from 'shared';
import { seenKeys } from '~/modules/seen/helpers';
import { queryClient } from '~/query/query-client';

/**
 * Batch unseen-count deltas into one idle cache write to avoid repeated full-cache persistence.
 * Counts clamp at zero; periodic exact recounts absorb residual drift.
 */
const pendingDeltas: { channelId: string; productType: ProductEntityType; delta: number }[] = [];
let flushScheduled = false;

/** Max delay before forcing a flush when the browser never goes idle */
const MAX_DELAY_MS = 5000;

const scheduleIdle =
  typeof requestIdleCallback === 'function'
    ? (cb: () => void) => requestIdleCallback(cb, { timeout: MAX_DELAY_MS })
    : (cb: () => void) => setTimeout(cb, MAX_DELAY_MS);

/** Queue a ± adjustment to a channel's unseen count */
export function applyUnseenDelta(channelId: string, productType: ProductEntityType, delta: number) {
  pendingDeltas.push({ channelId, productType, delta });
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

    for (const { channelId, productType, delta } of batch) {
      const next = Math.max(0, (updated[channelId]?.[productType] ?? 0) + delta);
      if (next > 0) {
        updated[channelId] = { ...updated[channelId], [productType]: next };
      } else if (updated[channelId]) {
        const { [productType]: _, ...rest } = updated[channelId];
        if (Object.keys(rest).length === 0) delete updated[channelId];
        else updated[channelId] = rest;
      }
    }
    return updated;
  });
}
