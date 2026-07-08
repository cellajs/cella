let staleBundle = false;

/** Marks this bundle as stale after a newer schema version appears in another tab or on disk. */
export function markBundleStale(): void {
  staleBundle = true;
}

/** Whether this bundle is behind another tab and must stop persisting. */
export function isBundleStale(): boolean {
  return staleBundle;
}

/** Test-only: clears the sticky stale flag between tests. */
export function resetBundleStale(): void {
  staleBundle = false;
}
