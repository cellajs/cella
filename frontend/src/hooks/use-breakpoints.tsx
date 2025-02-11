import { config } from 'config';
import { useEffect, useState } from 'react';

// Store global state in a module-level variable
let currentBreakpoint = '';
const listeners = new Set<(breakpoint: string) => void>();

// Sort breakpoints once for efficiency
const breakpoints: { [key: string]: string } = config.theme.screenSizes;
const sortedBreakpoints = Object.keys(breakpoints).sort((a, b) => Number.parseInt(breakpoints[a], 10) - Number.parseInt(breakpoints[b], 10));

// Function to get the matched breakpoint based on window width
const getMatchedBreakpoints = () => {
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
};

// Function to update global breakpoint state (runs only when necessary)
const updateGlobalBreakpoint = () => {
  const newBreakpoint = getMatchedBreakpoints();
  if (newBreakpoint !== currentBreakpoint) {
    currentBreakpoint = newBreakpoint;
    for (const listener of listeners) {
      listener(newBreakpoint);
    }
  }
};

// Attach the listener once per app lifecycle
if (typeof window !== 'undefined') {
  window.addEventListener('resize', updateGlobalBreakpoint);
  updateGlobalBreakpoint(); // Initialize on load
}

/**
 * Optimized breakpoint hook with shared state.
 * Prevents multiple instances from causing unnecessary state updates.
 */
export const useBreakpoints = (
  mustBe: 'min' | 'max',
  breakpoint: keyof typeof breakpoints,
  enableReactivity = true, // ✅ Reactivity flag
) => {
  const [breakpointState, setBreakpointState] = useState(currentBreakpoint);

  useEffect(() => {
    if (!enableReactivity) {
      return () => {}; // ✅ Always return a function (empty cleanup function)
    }

    const update = (bp: string) => setBreakpointState(bp);
    listeners.add(update);

    return () => {
      listeners.delete(update);
    };
  }, [enableReactivity]);

  const currentBreakpointIndex = sortedBreakpoints.indexOf(breakpointState);
  const targetBreakpointIndex = sortedBreakpoints.indexOf(breakpoint as string);

  return mustBe === 'min' ? currentBreakpointIndex >= targetBreakpointIndex : currentBreakpointIndex <= targetBreakpointIndex;
};
