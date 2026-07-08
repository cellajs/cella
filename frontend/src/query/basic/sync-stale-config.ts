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

/** Called by the realtime stream store on every app-stream state transition. */
export const setSyncStreamLive = (live: boolean): void => {
  syncStreamLive = live;
};

/**
 * Dynamic staleTime for product entity queries covered by the catchup pipeline.
 * Returns Infinity while the sync stream is live, otherwise a 5 minute fallback.
 */
export const syncStaleTime = () => (syncStreamLive ? syncLiveStaleTime : syncFallbackStaleTime);
