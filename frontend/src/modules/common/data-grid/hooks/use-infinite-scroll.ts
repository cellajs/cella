import { useEffect, useMemo, useRef } from 'react';
import type { Maybe } from '../types';

/** Arguments passed to onRowsEndApproaching callback */
export interface RowsEndApproachingArgs {
  /** Index of the last row being rendered (with overscan) */
  rowOverscanEndIdx: number;
  /** Total number of rows in the dataset */
  totalRows: number;
  /** Number of rows remaining until the end */
  rowsRemaining: number;
}

interface UseInfiniteScrollOptions {
  totalRows: number;
  rowOverscanEndIdx: number;
  clientHeight: number;
  /** Callback fired when approaching the end of the row dataset. */
  onRowsEndApproaching: Maybe<(args: RowsEndApproachingArgs) => void>;
  /**
   * Number of rows from the end at which the callback fires.
   * Defaults to a dynamic value: 25% of rows, clamped between 10 and 50.
   */
  threshold: Maybe<number>;
}

/**
 * Fires `onRowsEndApproaching` when the rendered viewport approaches the dataset
 * end (infinite scroll / load-more). Tracks `lastFiredForRowsLength` so it fires
 * once per `totalRows` value, not repeatedly after new data arrives.
 */
export function useInfiniteScroll({
  totalRows,
  rowOverscanEndIdx,
  clientHeight,
  onRowsEndApproaching,
  threshold,
}: UseInfiniteScrollOptions): void {
  const effectiveThreshold = useMemo(
    () => threshold ?? Math.min(50, Math.max(10, Math.floor(totalRows * 0.25))),
    [threshold, totalRows],
  );

  const lastFiredForRowsLengthRef = useRef(0);

  useEffect(() => {
    if (!onRowsEndApproaching || totalRows === 0) return;
    // Skip when clientHeight is 0 (layout not yet computed, all rows appear "visible")
    if (clientHeight === 0) return;

    const isApproachingEnd = rowOverscanEndIdx >= totalRows - effectiveThreshold;

    // Fire callback when approaching end, but only once per totalRows
    // (prevents re-triggering immediately after new data arrives)
    if (isApproachingEnd && lastFiredForRowsLengthRef.current !== totalRows) {
      lastFiredForRowsLengthRef.current = totalRows;
      onRowsEndApproaching({
        rowOverscanEndIdx,
        totalRows,
        rowsRemaining: totalRows - 1 - rowOverscanEndIdx,
      });
    }
  }, [onRowsEndApproaching, rowOverscanEndIdx, totalRows, effectiveThreshold, clientHeight]);
}
