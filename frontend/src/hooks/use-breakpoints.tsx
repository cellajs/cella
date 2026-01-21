import { appConfig } from 'config';
import { useSyncExternalStore } from 'react';

// Sort breakpoints once for efficiency
const breakpoints: { [key: string]: string } = appConfig.theme.screenSizes;
const sortedBreakpoints = Object.keys(breakpoints).sort(
  (a, b) => Number.parseInt(breakpoints[a], 10) - Number.parseInt(breakpoints[b], 10),
);

// Function to get the matched breakpoint based on window width
function getMatchedBreakpoints() {
  if (typeof window === 'undefined') return sortedBreakpoints[0];

  const width = window.innerWidth;
  let matched = sortedBreakpoints[0]; // Default to first breakpoint

  for (let i = 1; i < sortedBreakpoints.length; i++) {
    const prevBreakpointSize = Number.parseInt(breakpoints[sortedBreakpoints[i - 1]], 10);
    const currentBreakpointSize = Number.parseInt(breakpoints[sortedBreakpoints[i]], 10);

    if (width > currentBreakpointSize) {
      matched = sortedBreakpoints[i];
    } else if (width >= prevBreakpointSize && width < currentBreakpointSize) {
      matched = sortedBreakpoints[i];
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

// Subscribe function for useSyncExternalStore
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

/**
 * Breakpoint hook to determine if the current viewport matches the specified breakpoint condition.
 * @param mustBe - 'min' for minimum breakpoint, 'max' for maximum breakpoint
 * @param breakpoint - The target breakpoint key (e.g., 'sm', 'md', 'lg')
 * @param enableReactivity - Whether to enable reactivity to window resize events (default: true)
 * @returns boolean indicating if the current viewport matches the condition
 * @example
 * const isMobile = useBreakpoints('max', 'sm', false); // Non-reactive
 */
export function useBreakpoints(
  mustBe: 'min' | 'max',
  breakpoint: keyof typeof breakpoints,
  enableReactivity = true,
) {
  // useSyncExternalStore provides tear-free reads from external state
  const breakpointState = useSyncExternalStore(
    enableReactivity ? subscribe : () => () => { },
    getSnapshot,
    getServerSnapshot,
  );

  const currentBreakpointIndex = sortedBreakpoints.indexOf(breakpointState);
  const targetBreakpointIndex = sortedBreakpoints.indexOf(breakpoint as string);

  return mustBe === 'min'
    ? currentBreakpointIndex > targetBreakpointIndex
    : currentBreakpointIndex <= targetBreakpointIndex;
}
