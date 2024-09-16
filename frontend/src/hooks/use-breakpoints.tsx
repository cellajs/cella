import { config } from 'config';
import { useEffect, useState } from 'react';

type ValidBreakpoints = keyof typeof config.theme.screenSizes;

// This hook is used to conditionally render components based on the current screen width
export const useBreakpoints = (mustBe: 'min' | 'max', breakpoint: ValidBreakpoints): boolean => {
  const breakpoints: { [key: string]: string } = config.theme.screenSizes;
  // Sort breakpoints by their pixel value in ascending order
  const sortedBreakpoints = Object.keys(breakpoints).sort((a, b) => Number.parseInt(breakpoints[a], 10) - Number.parseInt(breakpoints[b], 10));
  const smallestBreakpoint = sortedBreakpoints[0];

  // Determine the current breakpoint based on window width
  const getBreakpoint = () => {
    const matchedBreakpoints = sortedBreakpoints.filter((point) => {
      const breakpointSize = Number.parseInt(breakpoints[point], 10);
      return !Number.isNaN(breakpointSize) && window.innerWidth >= breakpointSize;
    });

    // Return the highest matched breakpoint or the smallest breakpoint if none matched
    return matchedBreakpoints.pop() || smallestBreakpoint;
  };

  const [currentBreakpoint, setCurrentBreakpoint] = useState(getBreakpoint());

  useEffect(() => {
    let debounceTimeout: ReturnType<typeof setTimeout>;

    // Check and update the current breakpoint
    const checkBreakpoint = () => {
      const newBreakpoint = getBreakpoint();
      if (newBreakpoint !== currentBreakpoint) setCurrentBreakpoint(newBreakpoint);
    };

    checkBreakpoint();

    // Debounced function to handle window resize events
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

  // Determine if the current breakpoint matches the criteria
  const currentBreakpointIndex = sortedBreakpoints.indexOf(currentBreakpoint);
  const breakpointIndex = sortedBreakpoints.indexOf(breakpoint);
  const higher = currentBreakpointIndex > breakpointIndex;
  const lower = currentBreakpointIndex < breakpointIndex;

  return (mustBe === 'min' && higher) || (mustBe === 'max' && lower) || (!higher && !lower);
};
