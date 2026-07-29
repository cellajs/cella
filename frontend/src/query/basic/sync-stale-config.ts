/** StaleTime for sync-managed queries while the sync engine owns freshness. */
const syncTrustedStaleTime = Number.POSITIVE_INFINITY;

/** Fallback staleTime when the sync stream cannot be trusted (5 minutes). */
const syncFallbackStaleTime = 5 * 60 * 1000;

// Mirror stream health below realtime to avoid a circular import. Catch-up reconciles
// every connection, so only a hard stream error enables time-based freshness.
let syncStreamHealthy = true;

// Cleared on a delivery shortfall (a promised seq that never arrived), restored on a clean
// catchup. AND-ed with stream health: either failure drops us to the fallback staleTime.
let syncDeliveryTrusted = true;

/** Called by the realtime stream store on every app-stream state transition. */
export const setSyncStreamHealthy = (healthy: boolean): void => {
  syncStreamHealthy = healthy;
};

/** Marks synchronized delivery as trusted for the current session. */
export const setSyncDeliveryTrusted = (trusted: boolean): void => {
  syncDeliveryTrusted = trusted;
};
/** Reports whether synchronized delivery is trusted for the current session. */
export const isSyncDeliveryTrusted = (): boolean => syncDeliveryTrusted;

/**
 * Dynamic staleTime for product entity queries covered by the catchup pipeline.
 * Infinity while the stream is healthy AND deliveries reconcile; else a 5 minute fallback.
 */
export const syncStaleTime = () =>
  syncStreamHealthy && syncDeliveryTrusted ? syncTrustedStaleTime : syncFallbackStaleTime;
