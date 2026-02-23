import { useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import type { BoundaryType } from '~/routes/types';

/**
 * Hook to close overlays when switching route boundaries (e.g. app <-> public).
 * Uses TanStack Router's reactive state for cleaner reactivity.
 * Callback is expected to be stable (defined outside component or module-level).
 */
export function useBoundaryCleanup(closeAll: () => void) {
  const currentBoundary = useRouterState({
    select: (s) => s.matches.find((m) => m.staticData.boundary)?.staticData.boundary,
  });

  const prevBoundaryRef = useRef<BoundaryType>(undefined);

  // Handle boundary switching (app <-> public)
  useEffect(() => {
    if (prevBoundaryRef.current && currentBoundary && prevBoundaryRef.current !== currentBoundary) {
      closeAll();
    }
    prevBoundaryRef.current = currentBoundary;
  }, [currentBoundary]);
}
