import { useSyncExternalStore } from 'react';
import { appConfig } from 'shared';

const breakpoints: { [key: string]: string } = appConfig.theme.screenSizes;
const sortedBreakpoints = Object.keys(breakpoints).sort(
  (a, b) => Number.parseInt(breakpoints[a], 10) - Number.parseInt(breakpoints[b], 10),
);

// Largest breakpoint whose threshold is ≤ current width, matching CSS min-width media queries.
function getMatchedBreakpoints() {
  const width = window.innerWidth;
  let matched = sortedBreakpoints[0];

  for (const bp of sortedBreakpoints) {
    if (width >= Number.parseInt(breakpoints[bp], 10)) {
      matched = bp;
    } else {
      break;
    }
  }
  return matched;
}

let currentBreakpoint = getMatchedBreakpoints();
const listeners = new Set<() => void>();

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
window.addEventListener('resize', updateGlobalBreakpoint);

/** Subscribe to breakpoint changes; works outside React components. Returns an unsubscribe fn. */
export function subscribeToBreakpointChanges(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getBreakpointSnapshot() {
  return currentBreakpoint;
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return currentBreakpoint;
}

function getServerSnapshot() {
  return sortedBreakpoints[0];
}

type BreakpointKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export function useCurrentBreakpoint(enableReactivity = true): BreakpointKey {
  const breakpointState = useSyncExternalStore(
    enableReactivity ? subscribe : () => () => {},
    getSnapshot,
    getServerSnapshot,
  );
  // `xs` is not in screenSizes: derive it below the `sm` threshold.
  const smIndex = sortedBreakpoints.indexOf('sm');
  const currentIndex = sortedBreakpoints.indexOf(breakpointState);
  if (currentIndex <= smIndex && window.innerWidth < Number.parseInt(breakpoints.sm, 10)) {
    return 'xs';
  }
  return breakpointState as BreakpointKey;
}

function useBreakpointState(enableReactivity = true) {
  const breakpointState = useSyncExternalStore(
    enableReactivity ? subscribe : () => () => {},
    getSnapshot,
    getServerSnapshot,
  );
  return sortedBreakpoints.indexOf(breakpointState);
}

export function useBreakpointBelow(breakpoint: keyof typeof breakpoints, enableReactivity = true) {
  const currentIndex = useBreakpointState(enableReactivity);
  const targetIndex = sortedBreakpoints.indexOf(breakpoint as string);
  return currentIndex < targetIndex;
}

export function useBreakpointAbove(breakpoint: keyof typeof breakpoints, enableReactivity = true) {
  const currentIndex = useBreakpointState(enableReactivity);
  const targetIndex = sortedBreakpoints.indexOf(breakpoint as string);
  return currentIndex >= targetIndex;
}
