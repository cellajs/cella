import { onlineManager } from '@tanstack/react-query';
import { appConfig } from 'shared';

// /health defaults to shallow (204). ?depth=full for JSON diagnostics.
const HEALTH_URL = `${appConfig.backendUrl}/health`;
const FULL_HEALTH_URL = `${HEALTH_URL}?depth=full`;
const CACHE_TTL_MS = 10_000;

// Re-probe before declaring offline: mobile PWAs freeze the network radio when backgrounded, so the first fetches after resume fail until it reconnects.
const PROBE_RETRIES = 2;
const PROBE_RETRY_DELAY_MS = 750;

let lastCheckAt = 0;
let lastResult: boolean | null = null;
let inFlight: Promise<boolean> | null = null;

/** Probes `/health` after network failures to catch a false-positive browser online state; probes are cached and deduplicated, and a failure pauses queries and mutations through `onlineManager`. */
export async function checkConnectivity(): Promise<boolean> {
  const now = Date.now();

  if (lastResult !== null && now - lastCheckAt < CACHE_TTL_MS) {
    return lastResult;
  }

  if (inFlight) return inFlight;

  inFlight = probeHealth();
  try {
    return await inFlight;
  } finally {
    // Cleared even when probeHealth throws, so no call is stuck waiting on a dead promise.
    inFlight = null;
  }
}

/** Single HEAD request to /health. Returns true if reachable, false on any failure. */
async function fetchHealthOnce(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(HEALTH_URL, {
      method: 'HEAD',
      // no-store bypasses the browser cache so the request reaches the network; a CDN-cached 204 still proves the path to the edge works.
      cache: 'no-store',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

async function probeHealth(): Promise<boolean> {
  let isReachable = false;
  for (let attempt = 0; attempt <= PROBE_RETRIES; attempt++) {
    isReachable = await fetchHealthOnce();
    if (isReachable) break;
    if (attempt < PROBE_RETRIES) await new Promise((resolve) => setTimeout(resolve, PROBE_RETRY_DELAY_MS));
  }

  lastCheckAt = Date.now();
  lastResult = isReachable;

  if (!isReachable) onlineManager.setOnline(false);

  return isReachable;
}

/** Reset the cache when the browser fires the 'online' event, so the next failure triggers a fresh probe. */
export function resetConnectivityCache() {
  lastCheckAt = 0;
  lastResult = null;
}

/** Bypass cached connectivity on tab resume and restore online state after a successful probe. */
export async function revalidateConnectivity(): Promise<boolean> {
  resetConnectivityCache();
  const online = await checkConnectivity();
  if (online) onlineManager.setOnline(true);
  return online;
}

/** User-initiated force online. If the network is still down, the next failed fetch re-triggers the probe and reverts. */
export function forceOnline() {
  resetConnectivityCache();
  onlineManager.setOnline(true);
}

type AwaitRecoveryOptions = {
  signal: AbortSignal;
  factor?: number;
};

/** Polls /health?depth=full with exponential backoff; full depth verifies DB connectivity, not only network reachability. */
export async function awaitRecovery({ signal, factor = 1.5 }: AwaitRecoveryOptions): Promise<boolean> {
  let delay = 5000;
  const maxDelay = 600_000;
  const maxAttempts = 10;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) return false;

    try {
      const response = await fetch(FULL_HEALTH_URL);
      if (response.ok) return true;
    } catch {
      // Backend still unreachable.
    }

    delay = Math.min(maxDelay, delay * factor);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  return false;
}
