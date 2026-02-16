import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import type { BoundaryType } from '~/routes/types';
import { useNavigationStore } from '~/store/navigation';

// Track the last seen boundary to detect cross-boundary navigation
let lastSeenBoundary: BoundaryType | undefined;

/**
 * Cleans up sheets and dialogs when crossing layout boundaries.
 * Call this in layout route beforeLoad functions with cause === 'enter'.
 *
 * @param currentBoundary - The boundary of the layout being entered
 * @returns true if cleanup was performed
 */
export function cleanupOnBoundaryChange(currentBoundary: BoundaryType): boolean {
  // If we have a previous boundary and it's different from current, we're crossing boundaries
  const isCrossingBoundary = lastSeenBoundary && lastSeenBoundary !== currentBoundary;

  // Update the tracked boundary
  lastSeenBoundary = currentBoundary;

  if (isCrossingBoundary) {
    // Force close all sheets and dialogs
    useSheeter.getState().remove(undefined, { isCleanup: true });
    useDialoger.getState().remove(undefined, { isCleanup: true });
    useNavigationStore.getState().setNavSheetOpen(null);
    return true;
  }

  return false;
}

/**
 * Resets the boundary tracker. Call this on sign-out or full page reload.
 */
export function resetBoundaryTracker() {
  lastSeenBoundary = undefined;
}
