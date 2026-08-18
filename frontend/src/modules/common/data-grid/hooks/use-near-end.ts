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
  /** Rows from the end at which near-end reports true. Defaults to 25% of rows, clamped between 10 and 50. */
  threshold: Maybe<number>;
}

/** Level-triggered near-end state for infinite scrolling, so a consumer can retry a load it had to defer. */
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

  // Before measurement the overscan range is a placeholder, not a viewport position, so near-end reports false.
  const nearEnd = measured && totalRows > 0 && rowOverscanEndIdx >= totalRows - effectiveThreshold;

  useEffect(() => {
    onNearEndChange?.(nearEnd);
    // Reset on unmount and before re-runs so no consumer holds a near-end from a removed grid.
    return () => onNearEndChange?.(false);
  }, [nearEnd, onNearEndChange]);
}
