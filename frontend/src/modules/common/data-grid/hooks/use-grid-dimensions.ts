import type { RefObject } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';

interface GridDimensions {
  viewportHeight: number;
  horizontalScrollbarHeight: number;
  scrollTop: number;
  gridRect: DOMRect | null;
}

export interface GridDimensionsResult extends GridDimensions {
  gridRef: RefObject<HTMLDivElement | null>;
}

const initialDimensions: GridDimensions = {
  viewportHeight: 1,
  horizontalScrollbarHeight: 0,
  scrollTop: 0,
  gridRect: null,
};

/**
 * Walk up the DOM to find the nearest scrollable ancestor.
 * Returns null if the scroll container is the window/document.
 */
function getScrollParent(node: HTMLElement): HTMLElement | null {
  let parent: HTMLElement | null = node;
  // biome-ignore lint/suspicious/noAssignInExpressions: required for short-circuit assignment pattern
  while ((parent = parent.parentElement)) {
    if (parent === document.body || parent === document.documentElement) return null;
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return parent;
    }
  }
  return null;
}

/**
 * Hook to measure grid dimensions and track scroll position.
 * Auto-detects the nearest scrollable ancestor unless an explicit
 * scrollContainerRef is provided. Falls back to window-level scroll.
 *
 * Column virtualization is removed — the grid no longer tracks its own
 * inline-size in JS. CSS grid handles column sizing natively between
 * breakpoints. Only viewportHeight and scroll positions are tracked
 * (needed for row virtualization).
 *
 * ResizeObserver tracks only horizontalScrollbarHeight (rare changes).
 * All updates are rAF-throttled to stay cheap.
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

    // Determine the scroll container: explicit ref → auto-detect → window
    const scrollContainer = scrollContainerRef?.current ?? getScrollParent(grid);
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
        gridRect: rect,
      };
    };

    // --- Initial synchronous measurement ---
    const { clientHeight, offsetHeight } = grid;
    const initialHScrollbar = offsetHeight - clientHeight;

    const initial: GridDimensions = measureScroll({
      ...initialDimensions,
      horizontalScrollbarHeight: initialHScrollbar,
    });
    setDimensions(initial);

    // --- ResizeObserver: rAF-throttled for scrollbar height detection ---
    // No flushSync needed — column sizing is handled by CSS grid natively.
    // Only horizontalScrollbarHeight is tracked (changes when scrollbar appears/disappears).
    const resizeObserver = new ResizeObserver(() => {
      const { clientHeight, offsetHeight } = grid;
      const newHScrollbar = offsetHeight - clientHeight;

      scheduleUpdate(() => {
        setDimensions((prev) => {
          if (prev.horizontalScrollbarHeight === newHScrollbar) return prev;
          return { ...prev, horizontalScrollbarHeight: newHScrollbar };
        });
      });
    });
    resizeObserver.observe(grid);

    // --- Scroll handler (rAF-throttled) ---
    const handleScroll = () => {
      scheduleUpdate(() => {
        setDimensions((prev) => measureScroll(prev));
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

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      if (isWindowScroll) {
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('resize', handleResize);
      } else {
        scrollContainer.removeEventListener('scroll', handleScroll);
      }
    };
  }, [scrollContainerRef]);

  return {
    gridRef,
    ...dimensions,
  };
}
