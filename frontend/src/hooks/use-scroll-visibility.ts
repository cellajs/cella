import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

const SCROLL_THRESHOLD = 10; // Minimum scroll delta to toggle visibility
const MAX_GESTURE_DELTA = 150; // Larger single-frame jumps are hash jumps/restorations, not finger scrolls
const MIN_VISIBLE_MS = 800; // Grace period after showing before a down-scroll may hide again
const RESET_COOLDOWN_MS = 3000; // Cooldown period after reset where scroll events are ignored
const INITIAL_COOLDOWN_MS = 500; // Brief cooldown on mount to prevent hiding from restored scroll position

/**
 * Tracks scroll direction; returns `{ isVisible, scrollTop, reset }`.
 * Shows when scrolling up, hides when scrolling down.
 */
export const useScrollVisibility = (enabled = true, containerRef?: RefObject<HTMLElement | null>) => {
  const [isVisible, setIsVisible] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  const [container, setContainer] = useState<HTMLElement | Window | null>(null);
  const lastScrollY = useRef(0);
  const lastScrollHeight = useRef(0);
  const shownAt = useRef(0);
  const ticking = useRef(false);
  // Start with brief cooldown to handle browser scroll restoration on page reload
  const cooldownUntil = useRef(Date.now() + INITIAL_COOLDOWN_MS);

  const reset = useCallback(() => {
    setIsVisible(true);
    shownAt.current = Date.now();
    lastScrollY.current = containerRef?.current?.scrollTop ?? window.scrollY;
    lastScrollHeight.current = containerRef?.current?.scrollHeight ?? document.documentElement.scrollHeight;
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

    const getScrollHeight = () =>
      container instanceof Window ? document.documentElement.scrollHeight : container.scrollHeight;

    // Sync baselines with the actual position to handle restored scroll on page reload
    const initialY = container instanceof Window ? container.scrollY : container.scrollTop;
    lastScrollY.current = initialY;
    lastScrollHeight.current = getScrollHeight();
    setScrollTop(initialY);

    const handleScroll = () => {
      const currentY = container instanceof Window ? container.scrollY : container.scrollTop;
      ticking.current = false;

      // Always update scrollTop for consumers
      setScrollTop(currentY);

      // Content height changed (lazy body mounting, font swap, collapsibles): scroll
      // anchoring turns those into scroll events that aren't gestures — resync, don't flip.
      const currentHeight = getScrollHeight();
      if (currentHeight !== lastScrollHeight.current) {
        lastScrollHeight.current = currentHeight;
        lastScrollY.current = currentY;
        return;
      }

      // Skip visibility changes during cooldown period
      if (Date.now() < cooldownUntil.current) {
        lastScrollY.current = currentY;
        return;
      }

      const delta = currentY - lastScrollY.current;
      // Sub-threshold moves keep the stale baseline so small deltas accumulate
      if (Math.abs(delta) <= SCROLL_THRESHOLD) return;
      lastScrollY.current = currentY;

      // A jump too large for one gesture frame (hash jump, restoration): not a scroll
      if (Math.abs(delta) > MAX_GESTURE_DELTA) return;

      if (delta < 0) {
        // Scrolling up: show
        shownAt.current = Date.now();
        setIsVisible(true);
      } else if (Date.now() - shownAt.current > MIN_VISIBLE_MS) {
        // Scrolling down: hide, unless the button was only just revealed (anti-flap)
        setIsVisible(false);
      }
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
