import { useCallback, useEffect, useRef, useState } from 'react';

const scrollThreshold = 10; // Minimum scroll delta to toggle visibility
const maxGestureDelta = 150; // Larger single-frame jumps are hash jumps/restorations, not finger scrolls
const minVisibleMs = 800; // Grace period after showing before a down-scroll may hide again
const resetCooldownMs = 500; // Post-reset window that swallows layout-driven scroll jank (e.g. drawer close, docs page swap)
const initialCooldownMs = 500; // Brief cooldown on mount to prevent hiding from restored scroll position

const scrollHeight = () => document.documentElement.scrollHeight;

/** Shows on window scroll up, hides on scroll down; returns `{ isVisible, reset }`. For a scroll offset threshold use `useScrolledPast`. */
export const useScrollVisibility = (enabled = true) => {
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  const lastScrollHeightRef = useRef(0);
  const shownAtRef = useRef(0);
  const tickingRef = useRef(false);
  const cooldownUntilRef = useRef(Date.now() + initialCooldownMs);

  const reset = useCallback(() => {
    setIsVisible(true);
    shownAtRef.current = Date.now();
    lastScrollYRef.current = window.scrollY;
    lastScrollHeightRef.current = scrollHeight();
    cooldownUntilRef.current = Date.now() + resetCooldownMs;
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsVisible(true);
      return;
    }

    // Start the baselines at the actual position to handle restored scroll on page reload
    lastScrollYRef.current = window.scrollY;
    lastScrollHeightRef.current = scrollHeight();

    const updateVisibility = () => {
      const currentY = window.scrollY;
      tickingRef.current = false;

      // Scroll anchoring turns a content-height change into a non-gesture scroll event: take the new baseline without flipping.
      const currentHeight = scrollHeight();
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

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [enabled]);

  return { isVisible, reset };
};
