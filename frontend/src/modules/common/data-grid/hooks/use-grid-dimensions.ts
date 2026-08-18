import type { RefObject } from 'react';
import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from 'react';

interface GridDimensions {
  viewportHeight: number;
  horizontalScrollbarHeight: number;
  scrollTop: number;
  gridRect: DOMRect | null;
  /** False until the first layout measurement commits; the placeholder numbers below are not viewport geometry. */
  measured: boolean;
}

interface GridDimensionsResult extends GridDimensions {
  gridRef: RefObject<HTMLDivElement | null>;
}

const initialDimensions: GridDimensions = {
  viewportHeight: 1,
  horizontalScrollbarHeight: 0,
  scrollTop: 0,
  gridRect: null,
  measured: false,
};

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
export function useGridDimensions(
  scrollContainerRef?: RefObject<HTMLElement | null>,
  enableRowVirtualization = true,
): GridDimensionsResult {
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

      // Skip rerenders when nothing changed, but never while unmeasured: the first measurement must commit even if it matches the placeholders.
      if (
        prev.measured &&
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
        measured: true,
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

    // rAF-throttled ResizeObserver, tracking only horizontalScrollbarHeight.
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

    // --- Scroll handler (rAF-throttled), only needed for row virtualization ---
    const handleScroll = () => {
      scheduleUpdate(() => {
        commit(measureScroll(snapshotRef.current));
      });
    };

    const handleResize = () => {
      scheduleUpdate(() => {
        commit(measureScroll(snapshotRef.current));
      });
    };

    // Without row virtualization scrollTop is unused, and these listeners would only cause rerenders.
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
