import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from 'react';

/** A measured height within this of the height already assumed is subpixel noise (zoom, rounding), not a resize. */
const heightTolerance = 0.5;

interface MeasuredRowHeightsArgs<R> {
  gridRef: RefObject<HTMLDivElement | null>;
  rows: readonly R[];
  /** Estimated height per row; a measured height that equals it is not stored. */
  rowHeight: number | ((row: R) => number);
  enabled: boolean;
  headerRowsCount: number;
  /** Keys the cache; a row index when the grid has no row keys, so the cache stays as large as the rows. */
  getRowKey: (row: R, rowIdx: number) => unknown;
  /** The cache starts over when any of these change: the heights were measured for other columns or widths. */
  resetKeys: readonly unknown[];
}

interface HeightCache {
  resetKeys: readonly unknown[];
  heights: ReadonlyMap<unknown, number>;
}

const sameKeys = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((key, index) => Object.is(key, b[index]));

/**
 * Measures rendered rows, so a row that grew past its estimate keeps that height once it leaves the render window.
 * Otherwise its track falls back to the estimate and every row below it jumps while scrolling.
 */
export function useMeasuredRowHeights<R>({ gridRef, rows, rowHeight, enabled, headerRowsCount, getRowKey, resetKeys }: MeasuredRowHeightsArgs<R>) {
  const [cache, setCache] = useState<HeightCache>(() => ({ resetKeys, heights: new Map() }));
  const heights = sameKeys(cache.resetKeys, resetKeys) ? cache.heights : null;

  // Rows rendered for the viewport; a selected row kept mounted outside it holds one cell, so its height says nothing.
  const renderWindowRef = useRef<[start: number, end: number]>([0, -1]);
  const latestRef = useRef({ rows, rowHeight, getRowKey, headerRowsCount, resetKeys });
  useLayoutEffect(() => {
    latestRef.current = { rows, rowHeight, getRowKey, headerRowsCount, resetKeys };
  });

  const observerRef = useRef<ResizeObserver | null>(null);
  const observedRef = useRef(new Set<Element>());
  const observedResetKeysRef = useRef(resetKeys);

  useLayoutEffect(() => {
    if (!enabled || typeof ResizeObserver === 'undefined') return;
    const observed = observedRef.current;

    const observer = new ResizeObserver((entries) => {
      const { rows, rowHeight, getRowKey, headerRowsCount, resetKeys } = latestRef.current;
      const [start, end] = renderWindowRef.current;

      setCache((prev) => {
        const base = sameKeys(prev.resetKeys, resetKeys) ? prev.heights : new Map<unknown, number>();
        let next: Map<unknown, number> | null = null;

        for (const entry of entries) {
          const rowIdx = Number(entry.target.getAttribute('aria-rowindex')) - headerRowsCount - 1;
          if (rowIdx < start || rowIdx > end || rowIdx >= rows.length) continue;

          const row = rows[rowIdx];
          const key = getRowKey(row, rowIdx);
          const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
          const estimate = typeof rowHeight === 'number' ? rowHeight : rowHeight(row);
          const assumed = (next ?? base).get(key) ?? estimate;
          if (Math.abs(height - assumed) < heightTolerance) continue;

          next ??= new Map(base);
          // A row back at its estimate needs no entry: positions fall back to the estimate
          if (Math.abs(height - estimate) < heightTolerance) next.delete(key);
          else next.set(key, height);
        }

        if (next) return { resetKeys, heights: next };
        return base === prev.heights ? prev : { resetKeys, heights: base };
      });
    });

    observerRef.current = observer;
    return () => {
      observer.disconnect();
      observed.clear();
      observerRef.current = null;
    };
  }, [enabled]);

  // Rendered rows change on every scroll step, so this syncs the observed set after each commit
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const observer = observerRef.current;
    if (!grid || !observer) return;

    const observed = observedRef.current;
    // After a reset, rows that stay the same size would never report again: observing them anew reports their size
    if (!sameKeys(observedResetKeysRef.current, resetKeys)) {
      for (const row of observed) observer.unobserve(row);
      observed.clear();
      observedResetKeysRef.current = resetKeys;
    }
    const current = new Set<Element>();
    for (const row of grid.querySelectorAll(':scope > [role="row"]')) {
      if (Number(row.getAttribute('aria-rowindex')) > headerRowsCount) current.add(row);
    }
    for (const row of observed) {
      if (current.has(row)) continue;
      observer.unobserve(row);
      observed.delete(row);
    }
    for (const row of current) {
      if (observed.has(row)) continue;
      observer.observe(row);
      observed.add(row);
    }
  });

  const getMeasuredHeight = useCallback((row: R, rowIdx: number) => heights?.get(getRowKey(row, rowIdx)), [heights, getRowKey]);

  return { getMeasuredHeight: enabled ? getMeasuredHeight : undefined, renderWindowRef };
}
