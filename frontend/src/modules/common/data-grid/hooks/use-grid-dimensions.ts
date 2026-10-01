import type { RefObject } from 'react';
import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from 'react';

interface GridDimensions {
  viewportHeight: number;
  /** Scroll offset into the grid, clamped to its height and rounded to SCROLL_STEP. */
  scrollTop: number;
  /** False until the first layout measurement commits; the placeholder numbers below are not viewport geometry. */
  measured: boolean;
}

interface GridDimensionsResult extends GridDimensions {
  gridRef: RefObject<HTMLDivElement | null>;
}

const initialDimensions: GridDimensions = { viewportHeight: 1, scrollTop: 0, measured: false };

/**
 * scrollTop is rounded to this step, so scrolling commits a snapshot at most once per step. The row window shifts by at
 * most half a step (16px), well inside the four-row overscan of useViewportRows (140px at the 35px default row height).
 */
const SCROLL_STEP = 32;

/** Nearest scrollable ancestor, or null when the window or document is the scroll container. */
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

/** Row-virtualization dimensions from an explicit or nearest scroll container; CSS owns column sizing. */
export function useGridDimensions(scrollContainerRef?: RefObject<HTMLElement | null>, enableRowVirtualization = true): GridDimensionsResult {
  const gridRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<GridDimensions>(initialDimensions);
  // The notifier from useSyncExternalStore's subscribe lives in a ref, so the layout effect does not re-run when subscribe is re-invoked.
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

    const scrollContainer = scrollContainerRef?.current ?? getScrollParent(grid);
    const isWindowScroll = scrollContainer === null;

    // useSyncExternalStore re-reads getSnapshot after notify and bails out on an identical reference.
    const commit = (next: GridDimensions) => {
      if (next === snapshotRef.current) return;
      snapshotRef.current = next;
      notifyRef.current();
    };

    // rAF throttle batches rapid scroll / resize calls into one frame.
    let rafId = 0;
    const scheduleUpdate = (fn: () => void) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(fn);
    };

    /** Read scroll measurements; returns `prev` while the inputs of the row window are unchanged. */
    const measureScroll = (prev: GridDimensions): GridDimensions => {
      const rect = grid.getBoundingClientRect();
      const viewportHeight = isWindowScroll ? window.innerHeight : scrollContainer.clientHeight;
      const viewportTop = isWindowScroll ? 0 : scrollContainer.getBoundingClientRect().top;

      // Clamped to the grid's own range, so scrolling while the grid is out of view leaves the snapshot unchanged.
      const offset = Math.min(Math.max(0, viewportTop - rect.top), rect.height);
      const scrollTop = Math.round(offset / SCROLL_STEP) * SCROLL_STEP;

      // Skip rerenders when nothing changed, but never while unmeasured: the first measurement must commit even if it matches the placeholders.
      if (prev.measured && prev.viewportHeight === viewportHeight && prev.scrollTop === scrollTop) return prev;

      return { viewportHeight, scrollTop, measured: true };
    };

    // --- Initial synchronous measurement ---
    commit(measureScroll(initialDimensions));

    const remeasure = () => {
      scheduleUpdate(() => {
        commit(measureScroll(snapshotRef.current));
      });
    };

    // Without row virtualization scrollTop is unused, and these listeners would only cause rerenders.
    let resizeObserver: ResizeObserver | null = null;
    if (enableRowVirtualization) {
      if (isWindowScroll) {
        window.addEventListener('scroll', remeasure, { passive: true });
        window.addEventListener('resize', remeasure, { passive: true });
      } else {
        scrollContainer.addEventListener('scroll', remeasure, { passive: true });
        resizeObserver = new ResizeObserver(remeasure);
        resizeObserver.observe(scrollContainer);
      }
    }

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      if (isWindowScroll) {
        window.removeEventListener('scroll', remeasure);
        window.removeEventListener('resize', remeasure);
      } else {
        scrollContainer.removeEventListener('scroll', remeasure);
      }
    };
  }, [scrollContainerRef, enableRowVirtualization]);

  return { gridRef, ...dimensions };
}
