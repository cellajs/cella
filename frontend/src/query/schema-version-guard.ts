/**
 * A tab running an older bundle must never downgrade the shared IndexedDB store
 * after a newer-bundle tab has migrated it. The tab coordinator flips this flag
 * when it observes a higher schema version on the BroadcastChannel (and the
 * persister when it sees a newer pointer on disk); the persister consults it
 * before every write. Standalone (no React) to avoid import cycles.
 */
let staleBundle = false;

/** Marks this bundle as stale — newer schema version seen in another tab or on disk. */
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
