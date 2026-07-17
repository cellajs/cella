import { useEffect, useMemo } from 'react';
import type { Maybe } from '../types';

interface UseNearEndOptions {
  totalRows: number;
  /** Index of the last row being rendered (with overscan) */
  rowOverscanEndIdx: number;
  /** False until the scroll container has been measured; near-end is not evaluated before then. */
  measured: boolean;
  /** Level-triggered: receives the current near-end state whenever it changes, and false on unmount. */
  onNearEndChange: Maybe<(nearEnd: boolean) => void>;
  /**
   * Number of rows from the end at which near-end reports true.
   * Defaults to a dynamic value: 25% of rows, clamped between 10 and 50.
   */
  threshold: Maybe<number>;
}

/**
 * Reports whether the rendered viewport is near the end of the row dataset
 * (infinite scroll / load more) as level-triggered state, not a one-shot event.
 * The consumer pairs it with its own query state (isFetching, hasNextPage) and
 * re-evaluates when that state changes, so a load opportunity that can't be
 * acted on immediately (e.g. a background refetch is in flight) is retried once
 * it can be. A fired-and-dropped event here can stop infinite scroll
 * permanently.
 */
export function useNearEnd({
  totalRows,
  rowOverscanEndIdx,
  measured,
  onNearEndChange,
  threshold,
}: UseNearEndOptions): void {
  const effectiveThreshold = useMemo(
    () => threshold ?? Math.min(50, Math.max(10, Math.floor(totalRows * 0.25))),
    [threshold, totalRows],
  );

  // Before layout is measured the overscan range is a bounded placeholder, not a
  // real viewport position. Report false when the position is unknown.
  const nearEnd = measured && totalRows > 0 && rowOverscanEndIdx >= totalRows - effectiveThreshold;

  useEffect(() => {
    onNearEndChange?.(nearEnd);
    // Reset on unmount (and before re-runs) so consumers never hold a stale
    // near-end from a removed grid (e.g. filter change → skeleton).
    return () => onNearEndChange?.(false);
  }, [nearEnd, onNearEndChange]);
}
