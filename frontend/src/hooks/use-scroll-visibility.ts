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
  const lastScrollY = useRef(0);
  const lastScrollHeight = useRef(0);
  const shownAt = useRef(0);
  const ticking = useRef(false);
  const cooldownUntil = useRef(Date.now() + initialCooldownMs);

  const reset = useCallback(() => {
    setIsVisible(true);
    shownAt.current = Date.now();
    lastScrollY.current = containerRef?.current?.scrollTop ?? window.scrollY;
    lastScrollHeight.current = containerRef?.current?.scrollHeight ?? document.documentElement.scrollHeight;
    cooldownUntil.current = Date.now() + resetCooldownMs;
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

    // Sync baselines with the actual position to handle restored scroll on page reload
    const initialY = container instanceof Window ? container.scrollY : container.scrollTop;
    lastScrollY.current = initialY;
    lastScrollHeight.current = getScrollHeight();

    const handleScroll = () => {
      const currentY = container instanceof Window ? container.scrollY : container.scrollTop;
      ticking.current = false;

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
      if (Math.abs(delta) <= scrollThreshold) return;
      lastScrollY.current = currentY;

      if (Math.abs(delta) > maxGestureDelta) return;

      if (delta < 0) {
        shownAt.current = Date.now();
        setIsVisible(true);
      } else if (Date.now() - shownAt.current > minVisibleMs) {
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

  return { isVisible, reset };
};
