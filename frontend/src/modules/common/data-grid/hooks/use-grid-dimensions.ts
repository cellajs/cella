import type { RefObject } from 'react';
import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from 'react';

interface GridDimensions {
  viewportHeight: number;
  horizontalScrollbarHeight: number;
  scrollTop: number;
  gridRect: DOMRect | null;
}

interface GridDimensionsResult extends GridDimensions {
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
 * Backed by `useSyncExternalStore` to avoid tearing under concurrent
 * rendering (mirrors upstream PR #3968). All updates are rAF-throttled
 * to stay cheap. ResizeObserver tracks horizontalScrollbarHeight.
 */
export function useGridDimensions(
  scrollContainerRef?: RefObject<HTMLElement | null>,
  enableRowVirtualization = true,
): GridDimensionsResult {
  const gridRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<GridDimensions>(initialDimensions);
  // Latest React notifier registered via useSyncExternalStore's subscribe.
  // Stored in a ref so the layout effect below can call it without re-running
  // when subscribe is re-invoked (e.g. StrictMode double-mount in dev).
  const notifyRef = useRef<() => void>(() => {});

  const subscribe = useCallback((onStoreChange: () => void) => {
    notifyRef.current = onStoreChange;
    return () => {
      notifyRef.current = () => {};
    };
  }, []);

  const getSnapshot = useCallback(() => snapshotRef.current, []);
  const getServerSnapshot = useCallback(() => initialDimensions, []);

  const dimensions = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useLayoutEffect(() => {
    const { ResizeObserver } = window;
    const grid = gridRef.current;

    // Don't break in Node.js (SSR), jsdom, and browsers that don't support ResizeObserver
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (ResizeObserver == null || grid == null) return;

    // Determine the scroll container: explicit ref → auto-detect → window
    const scrollContainer = scrollContainerRef?.current ?? getScrollParent(grid);
    const isWindowScroll = scrollContainer === null;

    // Commit a new snapshot only if it differs from the cached one. Mutating
    // snapshotRef + calling the React notifier triggers a re-read via
    // getSnapshot — useSyncExternalStore handles the bailout when the
    // returned reference is identical.
    const commit = (next: GridDimensions) => {
      if (next === snapshotRef.current) return;
      snapshotRef.current = next;
      notifyRef.current();
    };

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

      // Bail out if nothing meaningful changed to avoid unnecessary rerenders
      if (
        prev.viewportHeight === viewportHeight &&
        Math.abs(prev.scrollTop - scrollTop) < 1 &&
        prev.gridRect?.top === rect.top &&
        prev.gridRect?.left === rect.left
      ) {
        return prev;
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

    commit(
      measureScroll({
        ...initialDimensions,
        horizontalScrollbarHeight: initialHScrollbar,
      }),
    );

    // --- ResizeObserver: rAF-throttled for scrollbar height detection ---
    // Only horizontalScrollbarHeight is tracked (changes when scrollbar appears/disappears).
    const resizeObserver = new ResizeObserver(() => {
      const { clientHeight, offsetHeight } = grid;
      const newHScrollbar = offsetHeight - clientHeight;

      scheduleUpdate(() => {
        const prev = snapshotRef.current;
        if (prev.horizontalScrollbarHeight === newHScrollbar) return;
        commit({ ...prev, horizontalScrollbarHeight: newHScrollbar });
      });
    });
    resizeObserver.observe(grid);

    // --- Scroll handler (rAF-throttled) — only needed for row virtualization ---
    const handleScroll = () => {
      scheduleUpdate(() => {
        commit(measureScroll(snapshotRef.current));
      });
    };

    // Window resize — viewport height changed (rAF-throttled)
    const handleResize = () => {
      scheduleUpdate(() => {
        commit(measureScroll(snapshotRef.current));
      });
    };

    // Only attach scroll/resize listeners when row virtualization is enabled.
    // Without virtualization, scrollTop is unused and these cause needless rerenders.
    if (enableRowVirtualization) {
      if (isWindowScroll) {
        window.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('resize', handleResize, { passive: true });
      } else {
        scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
        resizeObserver.observe(scrollContainer);
      }
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
  }, [scrollContainerRef, enableRowVirtualization]);

  return {
    gridRef,
    ...dimensions,
  };
}
