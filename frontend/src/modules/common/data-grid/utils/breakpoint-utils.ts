import type { BreakpointKey, ColumnVisibility, Maybe, MobileSubRowConfig, TouchModeConfig } from '../types';

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
 * Check if a column should be visible based on its visibility config and current breakpoint.
 */
export function isColumnVisible(visibility: Maybe<ColumnVisibility>, currentBreakpoint: BreakpointKey): boolean {
  if (visibility === undefined || visibility === null || visibility === true) return true;
  if (visibility === false) return false;

  const current = breakpointOrder[currentBreakpoint];

  if ('min' in visibility && 'max' in visibility) {
    return current >= breakpointOrder[visibility.min] && current <= breakpointOrder[visibility.max];
  }
  if ('min' in visibility) {
    return current >= breakpointOrder[visibility.min];
  }
  if ('max' in visibility) {
    return current <= breakpointOrder[visibility.max];
  }

  return true;
}

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

/**
 * Evaluate mobile sub-row configuration against current breakpoint.
 */
export function evaluateMobileSubRows(config: Maybe<MobileSubRowConfig>, currentBreakpoint: BreakpointKey): boolean {
  if (config === undefined || config === null) return false;
  if (typeof config === 'boolean') return config;

  const current = breakpointOrder[currentBreakpoint];

  if ('max' in config) {
    return current <= breakpointOrder[config.max];
  }

  return false;
}
