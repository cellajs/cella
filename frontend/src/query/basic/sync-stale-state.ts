/**
 * Mutable staleness state for sync-managed queries: three facts the realtime stream sets, and
 * the staleTime they resolve to. Module-level, so the realtime modules can set it without a store.
 */

/** StaleTime for sync-managed queries while the sync engine owns freshness. */
const syncTrustedStaleTime = Number.POSITIVE_INFINITY;

/** Fallback staleTime when the sync stream cannot be trusted (5 minutes). */
const syncFallbackStaleTime = 5 * 60 * 1000;

// Mirrors stream health below realtime to avoid a circular import: catch-up reconciles every connection, so only a hard stream error enables time-based freshness.
let syncStreamHealthy = true;

// Cleared on a delivery shortfall and restored on a clean catchup; either this or stream health failing drops to the fallback staleTime.
let syncDeliveryTrusted = true;

/** Called by the realtime stream store on every app-stream state transition. */
export const setSyncStreamHealthy = (healthy: boolean): void => {
  syncStreamHealthy = healthy;
};

export const setSyncDeliveryTrusted = (trusted: boolean): void => {
  syncDeliveryTrusted = trusted;
};
export const isSyncDeliveryTrusted = (): boolean => syncDeliveryTrusted;

// True while the server says no CDC worker reads: the stream is open and brings nothing, so changes of others arrive only when the worker reads on.
let syncWorkerAway = false;

/** Called with what the stream's keepalive says of the server's CDC worker. */
export const setSyncWorkerAway = (away: boolean): void => {
  syncWorkerAway = away;
};

/**
 * For product entity queries covered by the catchup pipeline: Infinity while the stream is healthy, deliveries reconcile
 * and the server's worker reads, otherwise the 5 minute fallback.
 */
export const syncStaleTime = () => (syncStreamHealthy && syncDeliveryTrusted && !syncWorkerAway ? syncTrustedStaleTime : syncFallbackStaleTime);
