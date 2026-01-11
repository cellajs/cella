import { type RefObject, useEffect, useRef, useState } from 'react';

const SCROLL_THRESHOLD = 10; // Minimum scroll delta to toggle visibility

/**
 * Hook that tracks scroll direction and returns visibility state.
 * Shows when scrolling up, hides when scrolling down.
 * @param enabled - Whether to enable scroll tracking
 * @param containerRef - Optional ref to a scrollable container (defaults to window)
 */
export const useScrollVisibility = (enabled = true, containerRef?: RefObject<HTMLElement | null>) => {
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setIsVisible(true);
      return;
    }

    const container = containerRef?.current;
    const scrollTarget = container || window;

    const handleScroll = () => {
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

  return isVisible;
};
