import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

const SCROLL_THRESHOLD = 10; // Minimum scroll delta to toggle visibility
const RESET_COOLDOWN_MS = 3000; // Cooldown period after reset where scroll events are ignored
const INITIAL_COOLDOWN_MS = 500; // Brief cooldown on mount to prevent hiding from restored scroll position

/**
 * Hook that tracks scroll direction and returns visibility state.
 * Shows when scrolling up, hides when scrolling down.
 * @param enabled - Whether to enable scroll tracking
 * @param containerRef - Optional ref to a scrollable container (defaults to window)
 * @returns Object with isVisible state, scrollTop position, and reset function
 */
export const useScrollVisibility = (enabled = true, containerRef?: RefObject<HTMLElement | null>) => {
  const [isVisible, setIsVisible] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  const [container, setContainer] = useState<HTMLElement | Window | null>(null);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);
  // Start with brief cooldown to handle browser scroll restoration on page reload
  const cooldownUntil = useRef(Date.now() + INITIAL_COOLDOWN_MS);

  const reset = useCallback(() => {
    setIsVisible(true);
    lastScrollY.current = containerRef?.current?.scrollTop ?? window.scrollY;
    cooldownUntil.current = Date.now() + RESET_COOLDOWN_MS;
  }, [containerRef]);

  // Wait for containerRef to be attached (refs are set after render)
  useEffect(() => {
    if (!enabled) {
      setContainer(null);
      return;
    }

    // If no containerRef provided, use window immediately
    if (!containerRef) {
      setContainer(window);
      return;
    }

    // Check if ref is already attached
    if (containerRef.current) {
      setContainer(containerRef.current);
      return;
    }

    // Poll for ref attachment (happens after first render)
    const checkRef = () => {
      if (containerRef.current) {
        setContainer(containerRef.current);
      }
    };

    // Use requestAnimationFrame to check after render
    const rafId = requestAnimationFrame(checkRef);
    return () => cancelAnimationFrame(rafId);
  }, [enabled, containerRef]);

  // Attach scroll listener once container is available
  useEffect(() => {
    if (!enabled || !container) {
      if (!enabled) setIsVisible(true);
      return;
    }

    // Sync lastScrollY with actual position to handle restored scroll on page reload
    const initialY = container instanceof Window ? container.scrollY : container.scrollTop;
    lastScrollY.current = initialY;
    setScrollTop(initialY);

    const handleScroll = () => {
      const currentY = container instanceof Window ? container.scrollY : container.scrollTop;

      // Always update scrollTop for consumers
      setScrollTop(currentY);

      // Skip visibility changes during cooldown period
      if (Date.now() < cooldownUntil.current) {
        lastScrollY.current = currentY;
        ticking.current = false;
        return;
      }

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

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [enabled, container]);

  return { isVisible, scrollTop, reset };
};
