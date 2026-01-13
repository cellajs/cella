import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

const SCROLL_THRESHOLD = 10; // Minimum scroll delta to toggle visibility
const RESET_COOLDOWN_MS = 3000; // Cooldown period after reset where scroll events are ignored

/**
 * Hook that tracks scroll direction and returns visibility state.
 * Shows when scrolling up, hides when scrolling down.
 * @param enabled - Whether to enable scroll tracking
 * @param containerRef - Optional ref to a scrollable container (defaults to window)
 * @returns Object with isVisible state and reset function
 */
export const useScrollVisibility = (enabled = true, containerRef?: RefObject<HTMLElement | null>) => {
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);
  const cooldownUntil = useRef(0);

  const reset = useCallback(() => {
    setIsVisible(true);
    lastScrollY.current = containerRef?.current?.scrollTop ?? window.scrollY;
    cooldownUntil.current = Date.now() + RESET_COOLDOWN_MS;
  }, [containerRef]);

  useEffect(() => {
    if (!enabled) {
      setIsVisible(true);
      return;
    }

    const container = containerRef?.current;
    const scrollTarget = container || window;

    const handleScroll = () => {
      // Skip visibility changes during cooldown period
      if (Date.now() < cooldownUntil.current) {
        lastScrollY.current = container ? container.scrollTop : window.scrollY;
        ticking.current = false;
        return;
      }

      const currentY = container ? container.scrollTop : window.scrollY;
      const delta = currentY - lastScrollY.current;

      if (Math.abs(delta) > SCROLL_THRESHOLD) {
        setIsVisible(delta < 0); // visible when scrolling up
        lastScrollY.current = currentY;
      }

      ticking.current = false;
    };

    const onScroll = () => {
      if (!ticking.current) {
        requestAnimationFrame(handleScroll);
        ticking.current = true;
      }
    };

    scrollTarget.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollTarget.removeEventListener('scroll', onScroll);
  }, [enabled, containerRef]);

  return { isVisible, reset };
};
