import type { RefObject } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

export interface GridDimensionsResult {
  gridRef: RefObject<HTMLDivElement | null>;
  /** Width of the grid */
  inlineSize: number;
  /** Height of the viewport (scroll container or window) */
  viewportHeight: number;
  /** Height of horizontal scrollbar if present */
  horizontalScrollbarHeight: number;
  /** Scroll position relative to the grid */
  scrollTop: number;
  /** Horizontal scroll position */
  scrollLeft: number;
  /** The grid's bounding rect for positioning portals */
  gridRect: DOMRect | null;
}

/**
 * Hook to measure grid dimensions and track scroll position.
 * Supports page-level scroll with optional scroll container override.
 */
export function useGridDimensions(scrollContainerRef?: RefObject<HTMLElement | null>): GridDimensionsResult {
  const gridRef = useRef<HTMLDivElement>(null);
  const [inlineSize, setInlineSize] = useState(1);
  const [viewportHeight, setViewportHeight] = useState(1);
  const [horizontalScrollbarHeight, setHorizontalScrollbarHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [gridRect, setGridRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    const { ResizeObserver } = window;
    const grid = gridRef.current;

    // Don't break in Node.js (SSR), jsdom, and browsers that don't support ResizeObserver
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (ResizeObserver == null || grid == null) return;

    // Determine the scroll container: provided ref, or window
    const scrollContainer = scrollContainerRef?.current ?? null;
    const isWindowScroll = scrollContainer === null;

    // Initial measurements
    const { clientWidth, clientHeight, offsetWidth, offsetHeight } = grid;
    const { width } = grid.getBoundingClientRect();
    const initialHorizontalScrollbarHeight = offsetHeight - clientHeight;
    const initialWidth = width - offsetWidth + clientWidth;

    // Viewport height is either the scroll container's client height or window inner height
    const initialViewportHeight = isWindowScroll ? window.innerHeight : scrollContainer.clientHeight;

    setInlineSize(initialWidth);
    setViewportHeight(initialViewportHeight);
    setHorizontalScrollbarHeight(initialHorizontalScrollbarHeight);
    setGridRect(grid.getBoundingClientRect());

    // Calculate initial scroll position relative to grid
    const updateScrollPosition = () => {
      const rect = grid.getBoundingClientRect();
      setGridRect(rect);

      if (isWindowScroll) {
        // For window scroll, scrollTop is how much of the grid is scrolled above viewport
        const effectiveScrollTop = Math.max(0, -rect.top);
        setScrollTop(effectiveScrollTop);
      } else {
        // For container scroll, calculate relative to container
        const containerRect = scrollContainer.getBoundingClientRect();
        const effectiveScrollTop = Math.max(0, containerRect.top - rect.top);
        setScrollTop(effectiveScrollTop);
      }

      // Horizontal scroll comes from the grid itself
      setScrollLeft(Math.abs(grid.scrollLeft));
    };

    updateScrollPosition();

    // Observe grid resize
    const resizeObserver = new ResizeObserver((entries) => {
      const size = entries[0].contentBoxSize[0];
      const { clientHeight, offsetHeight } = grid;

      flushSync(() => {
        setInlineSize(size.inlineSize);
        setHorizontalScrollbarHeight(offsetHeight - clientHeight);
        updateScrollPosition();
      });
    });
    resizeObserver.observe(grid);

    // Handle scroll events
    const handleScroll = () => {
      flushSync(() => {
        updateScrollPosition();
      });
    };

    // Handle horizontal scroll on the grid itself
    const handleGridScroll = () => {
      flushSync(() => {
        setScrollLeft(Math.abs(grid.scrollLeft));
      });
    };

    // Handle resize for viewport height updates
    const handleResize = () => {
      const newViewportHeight = isWindowScroll ? window.innerHeight : scrollContainer.clientHeight;
      setViewportHeight(newViewportHeight);
      updateScrollPosition();
    };

    // Attach scroll listeners
    if (isWindowScroll) {
      window.addEventListener('scroll', handleScroll, { passive: true });
      window.addEventListener('resize', handleResize, { passive: true });
    } else {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
      // Also observe container resize
      resizeObserver.observe(scrollContainer);
    }

    // Always listen to grid's horizontal scroll
    grid.addEventListener('scroll', handleGridScroll, { passive: true });

    return () => {
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
    inlineSize,
    viewportHeight,
    horizontalScrollbarHeight,
    scrollTop,
    scrollLeft,
    gridRect,
  };
}
