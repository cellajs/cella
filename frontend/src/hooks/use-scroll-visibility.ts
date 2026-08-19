import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

const SCROLL_THRESHOLD = 10; // Minimum scroll delta to toggle visibility
const MAX_GESTURE_DELTA = 150; // Larger single-frame jumps are hash jumps/restorations, not finger scrolls
const MIN_VISIBLE_MS = 800; // Grace period after showing before a down-scroll may hide again
const RESET_COOLDOWN_MS = 500; // Post-reset window that swallows layout-driven scroll jank (e.g. drawer close, docs page swap)
const INITIAL_COOLDOWN_MS = 500; // Brief cooldown on mount to prevent hiding from restored scroll position

/** Shows on scroll up, hides on scroll down; returns `{ isVisible, scrollTop, reset }`. */
export const useScrollVisibility = (enabled = true, containerRef?: RefObject<HTMLElement | null>) => {
  const [isVisible, setIsVisible] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  const [container, setContainer] = useState<HTMLElement | Window | null>(null);
  const lastScrollY = useRef(0);
  const lastScrollHeight = useRef(0);
  const shownAt = useRef(0);
  const ticking = useRef(false);
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

    if (!containerRef) {
      setContainer(window);
      return;
    }

    if (containerRef.current) {
      setContainer(containerRef.current);
      return;
    }

    const checkRef = () => {
      if (containerRef.current) {
        setContainer(containerRef.current);
      }
    };

    const rafId = requestAnimationFrame(checkRef);
    return () => cancelAnimationFrame(rafId);
  }, [enabled, containerRef]);

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

      setScrollTop(currentY);

      // Scroll anchoring turns a content-height change into a non-gesture scroll event: resync without flipping.
      const currentHeight = getScrollHeight();
      if (currentHeight !== lastScrollHeight.current) {
        lastScrollHeight.current = currentHeight;
        lastScrollY.current = currentY;
        return;
      }

      if (Date.now() < cooldownUntil.current) {
        lastScrollY.current = currentY;
        return;
      }

      const delta = currentY - lastScrollY.current;
      // Sub-threshold moves keep the stale baseline so small deltas accumulate
      if (Math.abs(delta) <= SCROLL_THRESHOLD) return;
      lastScrollY.current = currentY;

      if (Math.abs(delta) > MAX_GESTURE_DELTA) return;

      if (delta < 0) {
        shownAt.current = Date.now();
        setIsVisible(true);
      } else if (Date.now() - shownAt.current > MIN_VISIBLE_MS) {
        // Anti-flap: hide only once the grace period since showing has passed.
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
