/** StaleTime for sync-managed queries when stream is live. */
const syncLiveStaleTime = Number.POSITIVE_INFINITY;

/** Fallback staleTime when the sync stream is not live (5 minutes). */
const syncFallbackStaleTime = 5 * 60 * 1000;

/**
 * Mirror stream liveness below the realtime layer so stale-time logic avoids a circular import.
 * The realtime store pushes state through `setSyncStreamLive`.
 */
let syncStreamLive = false;

// Cleared on a delivery shortfall (a promised seq that never arrived), restored on a clean
// catchup. AND-ed with stream liveness: either failure drops us to the fallback staleTime.
let syncDeliveryTrusted = true;

/** Called by the realtime stream store on every app-stream state transition. */
export const setSyncStreamLive = (live: boolean): void => {
  syncStreamLive = live;
};

export const setSyncDeliveryTrusted = (trusted: boolean): void => {
  syncDeliveryTrusted = trusted;
};
export const isSyncDeliveryTrusted = (): boolean => syncDeliveryTrusted;

/**
 * Dynamic staleTime for product entity queries covered by the catchup pipeline.
 * Infinity while the stream is live AND deliveries reconcile; else a 5 minute fallback.
 */
export const syncStaleTime = () => (syncStreamLive && syncDeliveryTrusted ? syncLiveStaleTime : syncFallbackStaleTime);
