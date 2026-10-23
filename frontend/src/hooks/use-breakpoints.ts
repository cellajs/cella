import { useSyncExternalStore } from 'react';
import { appConfig } from 'shared';

const breakpoints: { [key: string]: string } = appConfig.theme.screenSizes;
const sortedBreakpoints = Object.keys(breakpoints).sort((a, b) => Number.parseInt(breakpoints[a], 10) - Number.parseInt(breakpoints[b], 10));

// One media query per breakpoint keeps JS in step with the CSS `md:` variants; on mobile `window.innerWidth` can follow the
// visual viewport (pinch zoom, overflowing content). jsdom has no matchMedia, so tests read innerWidth.
const mediaQueries = new Map(
  sortedBreakpoints.map((breakpoint) => [breakpoint, window.matchMedia?.(`(min-width: ${breakpoints[breakpoint]})`) ?? null] as const),
);

function matchesBreakpoint(breakpoint: string) {
  const query = mediaQueries.get(breakpoint);
  if (query) return query.matches;
  return window.innerWidth >= Number.parseInt(breakpoints[breakpoint], 10);
}

// Largest breakpoint whose min-width query matches; below the smallest threshold, the smallest (`xs`).
function getMatchedBreakpoint() {
  let matched = sortedBreakpoints[0];

  for (const breakpoint of sortedBreakpoints) {
    if (matchesBreakpoint(breakpoint)) {
      matched = breakpoint;
    } else {
      break;
    }
  }
  return matched;
}

let currentBreakpoint = getMatchedBreakpoint();
const listeners = new Set<() => void>();

function updateGlobalBreakpoint() {
  const newBreakpoint = getMatchedBreakpoint();
  if (newBreakpoint !== currentBreakpoint) {
    currentBreakpoint = newBreakpoint;
    for (const listener of listeners) {
      listener();
    }
  }
}

for (const query of mediaQueries.values()) {
  query?.addEventListener('change', updateGlobalBreakpoint);
}
if (!window.matchMedia) window.addEventListener('resize', updateGlobalBreakpoint);

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return currentBreakpoint;
}

type BreakpointKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export function useCurrentBreakpoint(enableReactivity = true): BreakpointKey {
  const breakpointState = useSyncExternalStore(enableReactivity ? subscribe : () => () => {}, getSnapshot);
  return breakpointState as BreakpointKey;
}

function useBreakpointIndex(enableReactivity = true) {
  return sortedBreakpoints.indexOf(useCurrentBreakpoint(enableReactivity));
}

export function useBreakpointBelow(breakpoint: BreakpointKey, enableReactivity = true) {
  return useBreakpointIndex(enableReactivity) < sortedBreakpoints.indexOf(breakpoint);
}

export function useBreakpointAbove(breakpoint: BreakpointKey, enableReactivity = true) {
  return useBreakpointIndex(enableReactivity) >= sortedBreakpoints.indexOf(breakpoint);
}
