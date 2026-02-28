import type { RefObject } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

interface GridDimensions {
  inlineSize: number;
  viewportHeight: number;
  horizontalScrollbarHeight: number;
  scrollTop: number;
  scrollLeft: number;
  gridRect: DOMRect | null;
}

export interface GridDimensionsResult extends GridDimensions {
  gridRef: RefObject<HTMLDivElement | null>;
}

const initialDimensions: GridDimensions = {
  inlineSize: 1,
  viewportHeight: 1,
  horizontalScrollbarHeight: 0,
  scrollTop: 0,
  scrollLeft: 0,
  gridRect: null,
};

/**
 * Hook to measure grid dimensions and track scroll position.
 * Supports page-level scroll with optional scroll container override.
 *
 * ResizeObserver uses flushSync to keep the grid width in sync with the DOM
 * (avoids a 1-frame flash where React still renders the old width).
 * Scroll & window-resize use rAF-throttled batched state to stay cheap.
 */
export function useGridDimensions(scrollContainerRef?: RefObject<HTMLElement | null>): GridDimensionsResult {
  const gridRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<GridDimensions>(initialDimensions);

  useLayoutEffect(() => {
    const { ResizeObserver } = window;
    const grid = gridRef.current;

    // Don't break in Node.js (SSR), jsdom, and browsers that don't support ResizeObserver
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (ResizeObserver == null || grid == null) return;

    // Determine the scroll container: provided ref, or window
    const scrollContainer = scrollContainerRef?.current ?? null;
    const isWindowScroll = scrollContainer === null;

    // rAF throttle — coalesces rapid scroll / resize calls into one frame
    let rafId = 0;
    const scheduleUpdate = (fn: () => void) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(fn);
    };

    /** Read scroll-related measurements and merge into previous state */
    const measureScroll = (prev: GridDimensions): GridDimensions => {
      const rect = grid.getBoundingClientRect();
      const viewportHeight = isWindowScroll ? window.innerHeight : scrollContainer.clientHeight;

      let scrollTop: number;
      if (isWindowScroll) {
        scrollTop = Math.max(0, -rect.top);
      } else {
        const containerRect = scrollContainer.getBoundingClientRect();
        scrollTop = Math.max(0, containerRect.top - rect.top);
      }

      return {
        ...prev,
        viewportHeight,
        scrollTop,
        scrollLeft: Math.abs(grid.scrollLeft),
        gridRect: rect,
      };
    };

    // --- Initial synchronous measurement ---
    const { clientWidth, clientHeight, offsetWidth, offsetHeight } = grid;
    const { width } = grid.getBoundingClientRect();
    const initialWidth = width - offsetWidth + clientWidth;
    const initialHScrollbar = offsetHeight - clientHeight;

    const initial: GridDimensions = measureScroll({
      ...initialDimensions,
      inlineSize: initialWidth,
      horizontalScrollbarHeight: initialHScrollbar,
    });
    setDimensions(initial);

    // --- ResizeObserver: must be synchronous to avoid visual tearing ---
    const resizeObserver = new ResizeObserver((entries) => {
      const size = entries[0].contentBoxSize[0];
      const { clientHeight, offsetHeight } = grid;

      // flushSync is intentional here — the grid MUST re-render at the new
      // width in the same frame as the DOM resize, otherwise a 1-frame flash
      // of the old width is visible (the grid "implodes" or overflows).
      flushSync(() => {
        setDimensions((prev) => ({
          ...prev,
          inlineSize: size.inlineSize,
          horizontalScrollbarHeight: offsetHeight - clientHeight,
        }));
      });
    });
    resizeObserver.observe(grid);

    // --- Scroll handler (rAF-throttled) ---
    const handleScroll = () => {
      scheduleUpdate(() => {
        setDimensions((prev) => measureScroll(prev));
      });
    };

    // Horizontal scroll on the grid element itself
    const handleGridScroll = () => {
      scheduleUpdate(() => {
        setDimensions((prev) => {
          const newScrollLeft = Math.abs(grid.scrollLeft);
          if (prev.scrollLeft === newScrollLeft) return prev;
          return { ...prev, scrollLeft: newScrollLeft };
        });
      });
    };

    // Window resize — viewport height changed (rAF-throttled)
    const handleResize = () => {
      scheduleUpdate(() => {
        setDimensions((prev) => measureScroll(prev));
      });
    };

    // Attach listeners
    if (isWindowScroll) {
      window.addEventListener('scroll', handleScroll, { passive: true });
      window.addEventListener('resize', handleResize, { passive: true });
    } else {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
      resizeObserver.observe(scrollContainer);
    }

    grid.addEventListener('scroll', handleGridScroll, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      if (isWindowScroll) {
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('resize', handleResize);
      } else {
        scrollContainer.removeEventListener('scroll', handleScroll);
      }
      grid.removeEventListener('scroll', handleGridScroll);
    };
  }, [scrollContainerRef]);

  return {
    gridRef,
    ...dimensions,
  };
}
