import type { BreakpointKey } from '../types';

/** Ordered breakpoints from smallest to largest */
export const breakpointOrder: Record<BreakpointKey, number> = {
  xs: 0,
  sm: 1,
  md: 2,
  lg: 3,
  xl: 4,
  '2xl': 5,
};
