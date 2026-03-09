import { useSyncExternalStore } from 'react';
import { appConfig } from 'shared';

// Sort breakpoints once for efficiency
const breakpoints: { [key: string]: string } = appConfig.theme.screenSizes;
const sortedBreakpoints = Object.keys(breakpoints).sort(
  (a, b) => Number.parseInt(breakpoints[a], 10) - Number.parseInt(breakpoints[b], 10),
);

// Function to get the matched breakpoint based on window width.
// Returns the largest breakpoint whose threshold is ≤ the current width,
// aligning with CSS min-width media queries.
function getMatchedBreakpoints() {
  if (typeof window === 'undefined') return sortedBreakpoints[0];

  const width = window.innerWidth;
  let matched = sortedBreakpoints[0]; // Default to smallest breakpoint

  for (const bp of sortedBreakpoints) {
    if (width >= Number.parseInt(breakpoints[bp], 10)) {
      matched = bp;
    } else {
      break;
    }
  }
  return matched;
}

// Store global state in a module-level variable - initialize immediately
let currentBreakpoint = getMatchedBreakpoints();
const listeners = new Set<() => void>();

// Function to update global breakpoint state (runs only when necessary)
function updateGlobalBreakpoint() {
  const newBreakpoint = getMatchedBreakpoints();
  if (newBreakpoint !== currentBreakpoint) {
    currentBreakpoint = newBreakpoint;
    for (const listener of listeners) {
      listener();
    }
  }
}

// Attach the listener once per app lifecycle
if (typeof window !== 'undefined') {
  window.addEventListener('resize', updateGlobalBreakpoint);
}

/**
 * Subscribe to breakpoint changes (works outside React components).
 * @param callback - Function to call when breakpoint changes
 * @returns Unsubscribe function
 */
export function subscribeToBreakpointChanges(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Get the current breakpoint snapshot (works outside React components).
 */
export function getBreakpointSnapshot() {
  return currentBreakpoint;
}

// Subscribe function for useSyncExternalStore (internal use)
function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// Snapshot functions for useSyncExternalStore
function getSnapshot() {
  return currentBreakpoint;
}

function getServerSnapshot() {
  return sortedBreakpoints[0];
}

/** Breakpoint key type for responsive utilities. */
type BreakpointKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/**
 * Hook to get the current breakpoint key based on viewport width.
 * Uses useSyncExternalStore for efficient single subscription.
 */
export function useCurrentBreakpoint(enableReactivity = true): BreakpointKey {
  const breakpointState = useSyncExternalStore(
    enableReactivity ? subscribe : () => () => {},
    getSnapshot,
    getServerSnapshot,
  );
  // Handle 'xs' case when breakpoint is smaller than 'sm'
  const smIndex = sortedBreakpoints.indexOf('sm');
  const currentIndex = sortedBreakpoints.indexOf(breakpointState);
  if (
    currentIndex <= smIndex &&
    typeof window !== 'undefined' &&
    window.innerWidth < Number.parseInt(breakpoints.sm, 10)
  ) {
    return 'xs';
  }
  return breakpointState as BreakpointKey;
}

/** Internal hook for breakpoint state — not exported directly. */
function useBreakpointState(enableReactivity = true) {
  const breakpointState = useSyncExternalStore(
    enableReactivity ? subscribe : () => () => {},
    getSnapshot,
    getServerSnapshot,
  );
  return sortedBreakpoints.indexOf(breakpointState);
}

/**
 * Returns true when the viewport is below the given breakpoint (strict less-than).
 * E.g. useBreakpointBelow('md') is true when viewport < 768px.
 * useBreakpointBelow(bp) and useBreakpointAbove(bp) are exact inverses when using the same bp.
 * @param breakpoint - The breakpoint to compare against (e.g., 'md', 'lg')
 * @param enableReactivity - Whether to re-render on resize (default: true)
 * @example
 * const isMobile = useBreakpointBelow('sm'); // true when viewport < 768px
 */
export function useBreakpointBelow(breakpoint: keyof typeof breakpoints, enableReactivity = true) {
  const currentIndex = useBreakpointState(enableReactivity);
  const targetIndex = sortedBreakpoints.indexOf(breakpoint as string);
  return currentIndex < targetIndex;
}

/**
 * Returns true when the viewport is at or above the given breakpoint.
 * E.g. useBreakpointAbove('md') is true when viewport >= 768px.
 * useBreakpointAbove(bp) and useBreakpointBelow(bp) are exact inverses when using the same bp.
 * @param breakpoint - The breakpoint to compare against (e.g., 'sm', 'xl')
 * @param enableReactivity - Whether to re-render on resize (default: true)
 * @example
 * const isDesktop = useBreakpointAbove('xl'); // true when viewport >= 1280px
 */
export function useBreakpointAbove(breakpoint: keyof typeof breakpoints, enableReactivity = true) {
  const currentIndex = useBreakpointState(enableReactivity);
  const targetIndex = sortedBreakpoints.indexOf(breakpoint as string);
  return currentIndex >= targetIndex;
}
