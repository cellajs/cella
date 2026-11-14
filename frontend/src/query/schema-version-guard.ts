import { checkForUpdate } from '~/utils/app-update';

let staleBundle = false;

/** Marks this bundle as stale after a newer bundle announces itself in another tab or wrote the store, and looks for the update: a worker it finds raises the reload prompt. */
export function markBundleStale(): void {
  if (staleBundle) return;
  staleBundle = true;
  void checkForUpdate();
}

/** Whether a newer bundle runs beside this one, which must stop persisting. */
export const isBundleStale = (): boolean => staleBundle;

/** Test-only: clears the sticky stale flag between tests. */
export function resetBundleStale(): void {
  staleBundle = false;
}
