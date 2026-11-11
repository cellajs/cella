import { useCallback, useEffect, useRef, useState } from 'react';

const hideThreshold = 10; // Downward travel that hides
const showThreshold = 64; // Upward travel that shows again: a finger settling or correcting a few pixels should not bring the buttons back
const topZone = 8; // No travel up is left here, and the buttons always show. The floating action's label expands at the same offset.
const maxGestureDelta = 150; // Larger single-frame jumps are hash jumps/restorations, not finger scrolls
const minVisibleMs = 800; // Grace period after showing before a down-scroll may hide again
const resetCooldownMs = 500; // Post-reset window that swallows layout-driven scroll jank (e.g. drawer close, docs page swap)
const initialCooldownMs = 500; // Brief cooldown on mount to prevent hiding from restored scroll position

const scrollHeight = () => document.documentElement.scrollHeight;

/** Shows on window scroll up, hides on scroll down; returns `{ isVisible, reset }`. For a scroll offset threshold use `useScrolledPast`. */
export const useScrollVisibility = (enabled = true) => {
  const [isVisible, setIsVisible] = useState(true);
  // For the scroll handler, which the state would reach a render late
  const isVisibleRef = useRef(true);
  const lastScrollYRef = useRef(0);
  const lastScrollHeightRef = useRef(0);
  const shownAtRef = useRef(0);
  // Signed travel since the scroll last turned: negative is up
  const travelRef = useRef(0);
  const tickingRef = useRef(false);
  const cooldownUntilRef = useRef(Date.now() + initialCooldownMs);

  const reset = useCallback(() => {
    isVisibleRef.current = true;
    setIsVisible(true);
    shownAtRef.current = Date.now();
    lastScrollYRef.current = window.scrollY;
    lastScrollHeightRef.current = scrollHeight();
    travelRef.current = 0;
    cooldownUntilRef.current = Date.now() + resetCooldownMs;
  }, []);

  useEffect(() => {
    if (!enabled) {
      isVisibleRef.current = true;
      setIsVisible(true);
      return;
    }

    // Start the baselines at the actual position to handle restored scroll on page reload
    lastScrollYRef.current = window.scrollY;
    lastScrollHeightRef.current = scrollHeight();

    const updateVisibility = () => {
      const currentY = window.scrollY;
      tickingRef.current = false;
      const isAtTop = currentY <= topZone;

      // Ahead of the early returns below: a jump to the top, such as a scroll reset, shows them too
      if (isAtTop && !isVisibleRef.current) {
        shownAtRef.current = Date.now();
        isVisibleRef.current = true;
        setIsVisible(true);
      }

      // Scroll anchoring turns a content-height change into a non-gesture scroll event: take the new baseline without flipping.
      // The travel so far stays, since a virtual list measures rows all through a scroll.
      const currentHeight = scrollHeight();
      if (currentHeight !== lastScrollHeightRef.current) {
        lastScrollHeightRef.current = currentHeight;
        lastScrollYRef.current = currentY;
        return;
      }

      if (Date.now() < cooldownUntilRef.current) {
        lastScrollYRef.current = currentY;
        travelRef.current = 0;
        return;
      }

      const delta = currentY - lastScrollYRef.current;
      if (delta === 0) return;
      lastScrollYRef.current = currentY;

      if (Math.abs(delta) > maxGestureDelta) {
        travelRef.current = 0;
        return;
      }

      travelRef.current = Math.sign(delta) === Math.sign(travelRef.current) ? travelRef.current + delta : delta;

      // Never hides at the top, where iOS springing back from an overscroll travels down
      if (travelRef.current < -showThreshold) {
        shownAtRef.current = Date.now();
        isVisibleRef.current = true;
        setIsVisible(true);
      } else if (travelRef.current > hideThreshold && !isAtTop && Date.now() - shownAtRef.current > minVisibleMs) {
        isVisibleRef.current = false;
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
