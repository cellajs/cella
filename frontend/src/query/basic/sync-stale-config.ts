/** StaleTime for sync-managed queries when stream is live. */
const syncLiveStaleTime = Number.POSITIVE_INFINITY;

/** Fallback staleTime when the sync stream is not live (5 minutes). */
const syncFallbackStaleTime = 5 * 60 * 1000;

/**
 * Low-level mirror of the app sync stream's "live" state.
 *
 * Kept here (in `query/basic`) so `syncStaleTime` can read stream liveness WITHOUT importing
 * the high-level `query/realtime` layer. The realtime stream store pushes updates via
 * `setSyncStreamLive`, inverting what would otherwise be a `query/basic` -> `query/realtime`
 * import (a circular dependency that surfaces as a module-init TDZ during Vite HMR).
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
