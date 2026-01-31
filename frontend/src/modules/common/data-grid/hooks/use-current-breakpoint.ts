import { useBreakpoints } from '~/hooks/use-breakpoints';
import type { BreakpointKey } from '../types';

/**
 * Hook to get the current breakpoint key based on viewport width.
 * Uses the global breakpoint detection from useBreakpoints.
 */
export function useCurrentBreakpoint(): BreakpointKey {
  // Check breakpoints from largest to smallest
  const is2xl = useBreakpoints('min', '2xl', true);
  const isXl = useBreakpoints('min', 'xl', true);
  const isLg = useBreakpoints('min', 'lg', true);
  const isMd = useBreakpoints('min', 'md', true);
  const isSm = useBreakpoints('min', 'sm', true);

  if (is2xl) return '2xl';
  if (isXl) return 'xl';
  if (isLg) return 'lg';
  if (isMd) return 'md';
  if (isSm) return 'sm';
  return 'xs';
}
