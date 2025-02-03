import { config } from 'config';
import { useEffect, useState } from 'react';

type ValidBreakpoints = keyof typeof config.theme.screenSizes;

/**
 * Custom hook to evaluate and track breakpoints in the browser window's size.
 *
 * This hook returns a boolean indicating whether the current breakpoints match the specified conditions
 * ('min' or 'max') and compares it with a target breakpoint from the configuration.
 * It optionally supports reactivity for updates on window resizing.
 *
 * @param mustBe - The condition to match `'min' | 'max'`.
 *   - 'min' checks if the current window width exceeds or matches the specified breakpoint.
 *   - 'max' checks if the current window width is less than or equal to the specified breakpoint.
 * @param breakpoint - Target breakpoint to compare against.
 * @param enableReactivity - Optional parameter to enable or disable reactivity.
 *   If enabled, the hook listens to window resize events and updates the breakpoints accordingly.
 *   Default is `true`.
 *
 * @returns Boolean (current window width matches the specified condition for the given breakpoint).
 */
export const useBreakpoints = (
  mustBe: 'min' | 'max',
  breakpoint: ValidBreakpoints,
  enableReactivity = true, // Optional parameter to enable/disable reactivity
) => {
  const breakpoints: { [key: string]: string } = config.theme.screenSizes;

  // Sort breakpoints by their pixel value in ascending order
  const sortedBreakpoints = Object.keys(breakpoints).sort((a, b) => Number.parseInt(breakpoints[a], 10) - Number.parseInt(breakpoints[b], 10));

  // Helper function to get the current matched breakpoints based on window width
  const getMatchedBreakpoints = () => {
    const width = window.innerWidth;

    // Start with the first breakpoint by default
    const matchedBreakpoints = [sortedBreakpoints[0]];

    // Loop through the breakpoints and check if the window width is between two breakpoints
    sortedBreakpoints.forEach((point, index) => {
      if (index > 0) {
        const prevBreakpointSize = Number.parseInt(breakpoints[sortedBreakpoints[index - 1]], 10);
        const currentBreakpointSize = Number.parseInt(breakpoints[point], 10);

        // Add the current breakpoint if window is larger
        if (width > currentBreakpointSize) return matchedBreakpoints.push(point);

        // Add the current breakpoint if window width is between this and the previous breakpoint
        if (width >= prevBreakpointSize && width < currentBreakpointSize) {
          matchedBreakpoints.push(point);
        }
      }
    });

    return matchedBreakpoints;
  };

  const [currentBreakpoints, setCurrentBreakpoints] = useState(getMatchedBreakpoints());

  // Update breakpoints on window resize
  useEffect(() => {
    if (!enableReactivity) return;

    const updateBreakpoints = () => {
      setCurrentBreakpoints(getMatchedBreakpoints());
    };

    // Initial call to set breakpoints
    updateBreakpoints();

    // Attach resize listener
    window.addEventListener('resize', updateBreakpoints);

    // Cleanup on unmount
    return () => window.removeEventListener('resize', updateBreakpoints);
  }, [breakpoints, enableReactivity]);

  // Get the index of the current largest matched breakpoint and target breakpoint
  const currentBreakpointIndex = sortedBreakpoints.indexOf(currentBreakpoints[currentBreakpoints.length - 1]);
  const targetBreakpointIndex = sortedBreakpoints.indexOf(breakpoint);

  // Logic to determine if current matches 'min' or 'max'
  if (mustBe === 'min') return currentBreakpointIndex - 1 >= targetBreakpointIndex;
  if (mustBe === 'max') return currentBreakpointIndex <= targetBreakpointIndex;

  return false;
};
