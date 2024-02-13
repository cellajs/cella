import { useEffect, useState } from 'react';
import { config } from 'config'

type ValidBreakpoints = keyof typeof config.theme.screenSizes;

export const useBreakpoints = (mustBe: 'min' | 'max', breakpoint: ValidBreakpoints): boolean => {
  const breakpoints: { [key: string]: string } = config.theme.screenSizes;
  const sortedBreakpoints = Object.keys(breakpoints).sort((a, b) => parseInt(breakpoints[a], 10) - parseInt(breakpoints[b], 10));
  const smallestBreakpoint = sortedBreakpoints[0];

  const getBreakpoint = () => {
    const matchedBreakpoints = sortedBreakpoints.filter((point) => {
      const breakpointSize = parseInt(breakpoints[point], 10);
      return !Number.isNaN(breakpointSize) && window.innerWidth >= breakpointSize;
    });

    return matchedBreakpoints.pop() || smallestBreakpoint;
  };

  const [currentBreakpoint, setCurrentBreakpoint] = useState(getBreakpoint());

  useEffect(() => {
    let debounceTimeout: ReturnType<typeof setTimeout>;

    const checkBreakpoint = () => {
      const newBreakpoint = getBreakpoint();
      if (newBreakpoint !== currentBreakpoint) setCurrentBreakpoint(newBreakpoint);
    };

    checkBreakpoint();

    const debouncedCheckBreakpoint = () => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(checkBreakpoint, 100);
    };

    window.addEventListener('resize', debouncedCheckBreakpoint);

    return () => {
      window.removeEventListener('resize', debouncedCheckBreakpoint);
      clearTimeout(debounceTimeout);
    };
  }, [breakpoints, currentBreakpoint]);

  const currentBreakpointIndex = sortedBreakpoints.indexOf(currentBreakpoint);
  const breakpointIndex = sortedBreakpoints.indexOf(breakpoint);
  const higher = currentBreakpointIndex > breakpointIndex;
  const lower = currentBreakpointIndex < breakpointIndex;

  return (mustBe === 'min' && higher) || (mustBe === 'max' && lower) || (!higher && !lower);
};
