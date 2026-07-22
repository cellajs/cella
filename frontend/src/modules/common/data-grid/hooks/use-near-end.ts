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
 * Reports near-end state as a level trigger for infinite scrolling.
 * Consumers can retry deferred loads when query state changes, avoiding dropped one-shot events.
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
