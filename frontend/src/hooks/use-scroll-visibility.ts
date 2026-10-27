import { useCallback, useEffect, useRef, useState } from 'react';

const scrollThreshold = 10; // Minimum scroll delta to toggle visibility
const maxGestureDelta = 150; // Larger single-frame jumps are hash jumps/restorations, not finger scrolls
const minVisibleMs = 800; // Grace period after showing before a down-scroll may hide again
const resetCooldownMs = 500; // Post-reset window that swallows layout-driven scroll jank (e.g. drawer close, docs page swap)
const initialCooldownMs = 500; // Brief cooldown on mount to prevent hiding from restored scroll position

const scrollTopOf = (target: HTMLElement | Window) => (target instanceof Window ? target.scrollY : target.scrollTop);
const scrollHeightOf = (target: HTMLElement | Window) => (target instanceof Window ? document.documentElement.scrollHeight : target.scrollHeight);

/**
 * Shows on scroll up, hides on scroll down; returns `{ isVisible, reset }`. `container` defaults to window: pass the element a
 * callback ref stores, null until it is attached. For a scroll offset threshold use `useScrolledPast`.
 */
export const useScrollVisibility = (enabled = true, container?: HTMLElement | null) => {
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  const lastScrollHeightRef = useRef(0);
  const shownAtRef = useRef(0);
  const tickingRef = useRef(false);
  const cooldownUntilRef = useRef(Date.now() + initialCooldownMs);

  const target = container === undefined ? window : container;

  const reset = useCallback(() => {
    setIsVisible(true);
    shownAtRef.current = Date.now();
    lastScrollYRef.current = scrollTopOf(target ?? window);
    lastScrollHeightRef.current = scrollHeightOf(target ?? window);
    cooldownUntilRef.current = Date.now() + resetCooldownMs;
  }, [target]);

  useEffect(() => {
    if (!enabled || !target) {
      if (!enabled) setIsVisible(true);
      return;
    }

    // Start the baselines at the actual position to handle restored scroll on page reload
    lastScrollYRef.current = scrollTopOf(target);
    lastScrollHeightRef.current = scrollHeightOf(target);

    const updateVisibility = () => {
      const currentY = scrollTopOf(target);
      tickingRef.current = false;

      // Scroll anchoring turns a content-height change into a non-gesture scroll event: take the new baseline without flipping.
      const currentHeight = scrollHeightOf(target);
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

    target.addEventListener('scroll', handleScroll, { passive: true });
    return () => target.removeEventListener('scroll', handleScroll);
  }, [enabled, target]);

  return { isVisible, reset };
};
