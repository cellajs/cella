import { onlineManager } from '@tanstack/react-query';
import { appConfig } from 'shared';
import { waitFor } from '~/utils/wait-for';

/** Shallow by default (204); `?depth=full` answers with JSON diagnostics. */
const healthUrl = `${appConfig.backendUrl}/health`;
const fullHealthUrl = `${healthUrl}?depth=full`;
const cacheTtlMs = 10_000;
const probeTimeoutMs = 5000;
const recoveryPollMs = 5000;

/** Re-probe before declaring offline: mobile PWAs freeze the network radio when backgrounded, so the first fetches after resume fail until it reconnects. */
const probeRetries = 2;
const probeRetryDelayMs = 750;

let lastCheckAt = 0;
let lastResult: boolean | null = null;
let inFlight: Promise<boolean> | null = null;

/** Probes `/health` after network failures to catch a false-positive browser online state; probes are cached and deduplicated, and a failure pauses queries and mutations through `onlineManager`. */
export async function checkConnectivity(): Promise<boolean> {
  if (lastResult !== null && Date.now() - lastCheckAt < cacheTtlMs) return lastResult;
  if (inFlight) return inFlight;

  inFlight = probeHealth();
  try {
    return await inFlight;
  } finally {
    // Cleared even when probeHealth throws, so no call is stuck waiting on a dead promise.
    inFlight = null;
  }
}

async function fetchHealthOnce(): Promise<boolean> {
  try {
    const response = await fetch(healthUrl, {
      method: 'HEAD',
      // no-store bypasses the browser cache so the request reaches the network; a CDN-cached 204 still proves the path to the edge works.
      cache: 'no-store',
      signal: AbortSignal.timeout(probeTimeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function probeHealth(): Promise<boolean> {
  let isReachable = false;
  for (let attempt = 0; attempt <= probeRetries; attempt++) {
    isReachable = await fetchHealthOnce();
    if (isReachable) break;
    if (attempt < probeRetries) await waitFor(probeRetryDelayMs);
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

/** Polls /health?depth=full until it answers or `signal` aborts; full depth verifies DB connectivity, not only network reachability. */
export async function awaitRecovery(signal: AbortSignal): Promise<boolean> {
  while (!signal.aborted) {
    try {
      const response = await fetch(fullHealthUrl, { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(probeTimeoutMs)]) });
      if (response.ok) return true;
    } catch {
      // Backend still unreachable.
    }
    await waitFor(recoveryPollMs);
  }
  return false;
}
