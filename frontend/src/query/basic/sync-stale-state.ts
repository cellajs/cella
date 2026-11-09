/** StaleTime while the sync engine owns freshness: Infinity, since `'static'` would also ignore the invalidations catchup reconciles with. */
const syncTrustedStaleTime = Number.POSITIVE_INFINITY;

const syncFallbackStaleTime = 5 * 60 * 1000;

/** Mirrors stream health below realtime to avoid a circular import: catchup reconciles every connection, so only a hard stream error enables time-based freshness. */
let syncStreamHealthy = true;

/** True while the server says no CDC worker reads: the stream is open and brings nothing, so changes of others arrive only when the worker reads on. */
let syncWorkerAway = false;

/** Called by the realtime stream store on every stream state transition. */
export function setSyncStreamHealthy(healthy: boolean): void {
  syncStreamHealthy = healthy;
}

/** Called with what the stream's keepalive says of the server's CDC worker. */
export function setSyncWorkerAway(away: boolean): void {
  syncWorkerAway = away;
}

/**
 * StaleTime of the product queries the catchup pipeline covers, from the two flags the realtime stream sets: Infinity
 * while the stream is healthy and the server's worker reads, otherwise the 5 minute fallback.
 */
export const syncStaleTime = (): number => (syncStreamHealthy && !syncWorkerAway ? syncTrustedStaleTime : syncFallbackStaleTime);
