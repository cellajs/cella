import type { GetUnseenCountsResponse } from 'sdk';
import type { ProductEntityType } from 'shared';
import { seenKeys } from '~/modules/seen/helpers';
import { queryClient } from '~/query/query-client';
import { scheduleIdle } from '~/utils/schedule-idle';

// Deltas batch into one idle cache write; counts clamp at zero and exact recounts absorb residual drift.
const pendingDeltas: { channelId: string; productType: ProductEntityType; delta: number }[] = [];
let flushScheduled = false;

/** Max delay before forcing a flush when the browser never goes idle */
const maxDelayMs = 5000;

export function applyUnseenDelta(channelId: string, productType: ProductEntityType, delta: number) {
  pendingDeltas.push({ channelId, productType, delta });
  if (flushScheduled) return;
  flushScheduled = true;
  scheduleIdle(flushDeltas, maxDelayMs);
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
