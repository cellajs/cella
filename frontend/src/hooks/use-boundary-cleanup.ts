import { useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import type { BoundaryType } from '~/routes/types';

/**
 * Hook to close overlays when crossing mobile/desktop boundary or switching route boundaries.
 * Uses TanStack Router's reactive state and useBreakpoints for cleaner reactivity.
 * Callbacks are expected to be stable (defined outside component or module-level).
 */
export function useBoundaryCleanup(
  getItemsToCloseOnResize: () => (string | number)[],
  closeAll: () => void,
  closeById: (id: string | number) => void,
) {
  const isMobile = useBreakpoints('max', 'sm');
  const currentBoundary = useRouterState({
    select: (s) => s.matches.find((m) => m.staticData.boundary)?.staticData.boundary,
  });

  const prevIsMobileRef = useRef<boolean | null>(null);
  const prevBoundaryRef = useRef<BoundaryType>(undefined);

  // Handle mobile/desktop boundary crossing
  useEffect(() => {
    if (prevIsMobileRef.current !== null && prevIsMobileRef.current !== isMobile) {
      for (const id of getItemsToCloseOnResize()) closeById(id);
    }
    prevIsMobileRef.current = isMobile;
  }, [isMobile]);

  // Handle boundary switching (app <-> public)
  useEffect(() => {
    if (prevBoundaryRef.current && currentBoundary && prevBoundaryRef.current !== currentBoundary) {
      closeAll();
    }
    prevBoundaryRef.current = currentBoundary;
  }, [currentBoundary]);
}
