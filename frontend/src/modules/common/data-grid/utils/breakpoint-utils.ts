import type { BreakpointKey, Maybe, TouchModeConfig } from '../types';

/** Ordered breakpoints from smallest to largest */
export const breakpointOrder: Record<BreakpointKey, number> = {
  xs: 0,
  sm: 1,
  md: 2,
  lg: 3,
  xl: 4,
  '2xl': 5,
};

/**
 * Evaluate touch mode configuration against current breakpoint.
 */
export function evaluateTouchMode(config: Maybe<TouchModeConfig>, currentBreakpoint: BreakpointKey): boolean {
  if (config === undefined || config === null) return false;
  if (typeof config === 'boolean') return config;

  const current = breakpointOrder[currentBreakpoint];

  if ('max' in config) {
    return current <= breakpointOrder[config.max];
  }
  if ('min' in config) {
    return current >= breakpointOrder[config.min];
  }

  return false;
}
