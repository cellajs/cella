import { useSyncExternalStore } from 'react';
import { appConfig } from 'shared';

const breakpoints: { [key: string]: string } = appConfig.theme.screenSizes;
const sortedBreakpoints = Object.keys(breakpoints).sort(
  (a, b) => Number.parseInt(breakpoints[a], 10) - Number.parseInt(breakpoints[b], 10),
);

// One media query per breakpoint, so JS agrees with the CSS `md:` variants. `window.innerWidth` does not: on
// mobile it can follow the visual viewport (pinch zoom, overflowing content) and flip layouts the CSS never flips.
// jsdom has no matchMedia; tests fall back to innerWidth there.
const mediaQueries = new Map(
  sortedBreakpoints.map((bp) => [bp, window.matchMedia?.(`(min-width: ${breakpoints[bp]})`) ?? null] as const),
);

function matchesBreakpoint(bp: string) {
  const mql = mediaQueries.get(bp);
  if (mql) return mql.matches;
  return window.innerWidth >= Number.parseInt(breakpoints[bp], 10);
}

// Largest breakpoint whose min-width query matches; below the smallest threshold, the smallest (`xs`).
function getMatchedBreakpoints() {
  let matched = sortedBreakpoints[0];

  for (const bp of sortedBreakpoints) {
    if (matchesBreakpoint(bp)) {
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

// Attach the listeners once per app lifecycle
for (const mql of mediaQueries.values()) {
  mql?.addEventListener('change', updateGlobalBreakpoint);
}
if (!window.matchMedia) window.addEventListener('resize', updateGlobalBreakpoint);

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
