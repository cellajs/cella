import { onlineManager } from '@tanstack/react-query';
import { appConfig } from 'shared';

// Uses ?depth=shallow for a lightweight 204 probe (no DB check, no JSON).
// The full /health endpoint is reserved for monitoring and stream-store recovery.
const PROBE_URL = `${appConfig.backendUrl}/health?depth=shallow`;
const CACHE_TTL_MS = 10_000;

let lastCheckAt = 0;
let lastResult: boolean | null = null;
let inFlight: Promise<boolean> | null = null;

/**
 * Probe actual internet connectivity via /health?depth=shallow.
 *
 * Triggered by network-level fetch failures (TypeError) in api-config.ts and on-error.ts
 * to detect "WiFi connected but no internet" — a scenario where navigator.onLine stays
 * true but all API calls fail.
 *
 * Behavior:
 * - Results cached for 10s to debounce bursts of failing queries
 * - Concurrent calls are deduplicated (single in-flight probe)
 * - On failure: sets onlineManager.setOnline(false), which cascades to:
 *   → DownAlert shows "offline" banner
 *   → staleTime goes infinite (stops refetch attempts)
 *   → mutations pause until reconnect
 * - On recovery: browser 'online' event resets cache (via resetConnectivityCache)
 *   and sets onlineManager back online, restoring normal operation
 */
export async function checkConnectivity(): Promise<boolean> {
  const now = Date.now();

  // Return cached result if still fresh
  if (lastResult !== null && now - lastCheckAt < CACHE_TTL_MS) {
    return lastResult;
  }

  // Deduplicate concurrent calls
  if (inFlight) return inFlight;

  inFlight = probeHealth();
  try {
    return await inFlight;
  } finally {
    // Always clear inFlight — prevents stuck state if probeHealth throws unexpectedly
    inFlight = null;
  }
}

async function probeHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(PROBE_URL, {
      method: 'HEAD',
      // no-store bypasses browser cache so the request always hits the network/CDN.
      // The CDN may still serve a cached 204 (max-age=5), which is fine — it proves
      // the network path to the edge is working.
      cache: 'no-store',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const isReachable = response.ok;

    lastCheckAt = Date.now();
    lastResult = isReachable;

    if (!isReachable) onlineManager.setOnline(false);

    return isReachable;
  } catch {
    lastCheckAt = Date.now();
    lastResult = false;

    onlineManager.setOnline(false);
    return false;
  }
}

/** Reset the cache when the browser fires the 'online' event, so the next failure triggers a fresh probe. */
export function resetConnectivityCache() {
  lastCheckAt = 0;
  lastResult = null;
}

/** User-initiated "force online" — resets probe cache and tells the system to try going online.
 *  If still actually offline, the next failed fetch will re-trigger the probe and revert. */
export function forceOnline() {
  resetConnectivityCache();
  onlineManager.setOnline(true);
}
