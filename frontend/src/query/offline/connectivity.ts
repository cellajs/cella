import { onlineManager } from '@tanstack/react-query';
import { appConfig } from 'shared';
import { waitFor } from '~/utils/wait-for';

/** Shallow (204): whether the network reaches the API, not whether its database is up. */
const healthUrl = `${appConfig.backendUrl}/health`;
const probeTimeoutMs = 5000;

/** Re-probe before declaring offline: mobile PWAs freeze the network radio when backgrounded, so the first fetches after resume fail until it reconnects. */
const probeRetries = 2;
const probeRetryDelayMs = 750;

/** Waits between re-checks while offline, the last one repeating: an outage met on resume mostly ends within seconds. */
const recheckDelaysMs = [1000, 2000, 5000];

let probing = false;
/** When a response last showed that the network reaches the API. */
let reachableAt = 0;
let recheckTimer: ReturnType<typeof setTimeout> | null = null;
let recheckCount = 0;

async function isReachable(): Promise<boolean> {
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

/**
 * A request got no response: probe `/health` and take the app offline once every attempt fails, which pauses queries
 * and mutations through `onlineManager`. A failure while offline or while a probe runs adds nothing, and a response
 * that arrives while the probe runs overrules it.
 */
export async function reportNetworkFailure(): Promise<void> {
  if (probing || !onlineManager.isOnline()) return;
  probing = true;
  const startedAt = Date.now();
  try {
    for (let attempt = 0; attempt <= probeRetries; attempt++) {
      if (await isReachable()) return;
      if (attempt < probeRetries) await waitFor(probeRetryDelayMs);
    }
    if (reachableAt < startedAt) onlineManager.setOnline(false);
  } finally {
    probing = false;
  }
}

/**
 * The API answered a request or sent a stream event. While the browser reports no network the answer may predate its
 * `offline` event, so it proves nothing.
 */
export function reportReachable(): void {
  if (!navigator.onLine) return;
  reachableAt = Date.now();
  onlineManager.setOnline(true);
}

function clearRecheck() {
  if (recheckTimer) clearTimeout(recheckTimer);
  recheckTimer = null;
}

/** Re-checks only while a visible tab is offline and the browser reports a network; its `online` event ends the other outages. */
function scheduleRecheck() {
  clearRecheck();
  if (onlineManager.isOnline() || document.hidden || !navigator.onLine) return;
  const delay = recheckDelaysMs[Math.min(recheckCount, recheckDelaysMs.length - 1)];
  recheckCount++;
  recheckTimer = setTimeout(recheckNow, delay);
}

/**
 * Probe once now and bring the app online if the API answers, else keep re-checking.
 * @returns Whether the API answered.
 */
export async function recheckNow(): Promise<boolean> {
  clearRecheck();
  const reachable = await isReachable();
  if (reachable) onlineManager.setOnline(true);
  else scheduleRecheck();
  return reachable;
}

/** Re-checks while the app is offline, and at once when the tab becomes visible; returns the stop function. */
export function startConnectivity(): () => void {
  const unsubscribe = onlineManager.subscribe((online) => {
    recheckCount = 0;
    if (online) clearRecheck();
    else scheduleRecheck();
  });
  const onVisibilityChange = () => {
    if (document.hidden || onlineManager.isOnline() || !navigator.onLine) return clearRecheck();
    recheckCount = 0;
    void recheckNow();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  scheduleRecheck();

  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    clearRecheck();
  };
}
