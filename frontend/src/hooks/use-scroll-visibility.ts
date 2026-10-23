import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

const scrollThreshold = 10; // Minimum scroll delta to toggle visibility
const maxGestureDelta = 150; // Larger single-frame jumps are hash jumps/restorations, not finger scrolls
const minVisibleMs = 800; // Grace period after showing before a down-scroll may hide again
const resetCooldownMs = 500; // Post-reset window that swallows layout-driven scroll jank (e.g. drawer close, docs page swap)
const initialCooldownMs = 500; // Brief cooldown on mount to prevent hiding from restored scroll position

/** Shows on scroll up, hides on scroll down; returns `{ isVisible, reset }`. For a scroll offset threshold use `useScrolledPast`. */
export const useScrollVisibility = (enabled = true, containerRef?: RefObject<HTMLElement | null>) => {
  const [isVisible, setIsVisible] = useState(true);
  const [container, setContainer] = useState<HTMLElement | Window | null>(null);
  const lastScrollYRef = useRef(0);
  const lastScrollHeightRef = useRef(0);
  const shownAtRef = useRef(0);
  const tickingRef = useRef(false);
  const cooldownUntilRef = useRef(Date.now() + initialCooldownMs);

  const reset = useCallback(() => {
    setIsVisible(true);
    shownAtRef.current = Date.now();
    lastScrollYRef.current = containerRef?.current?.scrollTop ?? window.scrollY;
    lastScrollHeightRef.current = containerRef?.current?.scrollHeight ?? document.documentElement.scrollHeight;
    cooldownUntilRef.current = Date.now() + resetCooldownMs;
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

    const getScrollHeight = () => (container instanceof Window ? document.documentElement.scrollHeight : container.scrollHeight);

    // Start the baselines at the actual position to handle restored scroll on page reload
    const initialY = container instanceof Window ? container.scrollY : container.scrollTop;
    lastScrollYRef.current = initialY;
    lastScrollHeightRef.current = getScrollHeight();

    const updateVisibility = () => {
      const currentY = container instanceof Window ? container.scrollY : container.scrollTop;
      tickingRef.current = false;

      // Scroll anchoring turns a content-height change into a non-gesture scroll event: take the new baseline without flipping.
      const currentHeight = getScrollHeight();
      if (currentHeight !== lastScrollHeightRef.current) {
        lastScrollHeightRef.current = currentHeight;
        lastScrollYRef.current = currentY;
        return;
      }

      if (Date.now() < cooldownUntilRef.current) {
        lastScrollYRef.current = currentY;
        return;
      }

      const delta = currentY - lastScrollYRef.current;
      // Sub-threshold moves keep the stale baseline so small deltas accumulate
      if (Math.abs(delta) <= scrollThreshold) return;
      lastScrollYRef.current = currentY;

      if (Math.abs(delta) > maxGestureDelta) return;

      if (delta < 0) {
        shownAtRef.current = Date.now();
        setIsVisible(true);
      } else if (Date.now() - shownAtRef.current > minVisibleMs) {
        setIsVisible(false);
      }
    };

    const handleScroll = () => {
      if (!tickingRef.current) {
        requestAnimationFrame(updateVisibility);
        tickingRef.current = true;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [enabled, container]);

  return { isVisible, reset };
};
