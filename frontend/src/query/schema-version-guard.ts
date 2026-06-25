/**
 * Stale-bundle guard (info/SCHEMA_EVOLUTION.md, 1.7).
 *
 * A tab running an older bundle must never downgrade the shared IndexedDB store
 * after a newer-bundle tab has migrated it. The tab coordinator flips this flag
 * when it observes a higher schema version on the BroadcastChannel; the persister
 * consults it before every write. Standalone (no React) to avoid import cycles.
 */
let staleBundle = false;

/** Marks this bundle as stale — newer schema version seen in another tab. */
export function markBundleStale(): void {
  staleBundle = true;
}

/** Whether this bundle is behind another tab and must stop persisting. */
export function isBundleStale(): boolean {
  return staleBundle;
}
