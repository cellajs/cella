const hasIdleCallback = typeof requestIdleCallback === 'function';

/** Runs the callback once the browser is idle, at the latest after `timeoutMs`; without requestIdleCallback (Safari) it waits the full timeout. */
export function scheduleIdle(callback: () => void, timeoutMs: number) {
  return hasIdleCallback ? requestIdleCallback(callback, { timeout: timeoutMs }) : window.setTimeout(callback, timeoutMs);
}

export function cancelIdle(handle: number) {
  if (hasIdleCallback) cancelIdleCallback(handle);
  else window.clearTimeout(handle);
}
