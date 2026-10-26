import { useMemo } from 'react';
import { floor, max, min } from '../utils/grid-utils';

/** Bound the pre-measurement row set until the real overscan window is available. */
const unmeasuredRowCount = 30;

interface ViewportRowsArgs<R> {
  rows: readonly R[];
  rowHeight: number | ((row: R) => number);
  clientHeight: number;
  scrollTop: number;
  enableVirtualization: boolean;
  measured: boolean;
  /** Height a rendered row was measured at; rows without one are positioned at their estimate. */
  getMeasuredHeight?: (row: R, rowIdx: number) => number | undefined;
}

interface RowPosition {
  top: number;
  height: number;
  estimate: number;
}

const emptyRowPosition: RowPosition = { top: 0, height: 0, estimate: 0 };

/** Run-length encoded track list, so rows of equal height share one `repeat()`. */
function buildTemplate(tracks: Iterable<string>) {
  let template = '';
  let run: string | null = null;
  let count = 0;
  const flush = () => {
    if (run === null) return;
    template += count > 1 ? `repeat(${count},${run}) ` : `${run} `;
  };
  for (const track of tracks) {
    if (track === run) {
      count++;
      continue;
    }
    flush();
    run = track;
    count = 1;
  }
  flush();
  return template;
}

export function useViewportRows<R>({
  rows,
  rowHeight,
  clientHeight,
  scrollTop,
  enableVirtualization,
  measured,
  getMeasuredHeight,
}: ViewportRowsArgs<R>) {
  const layout = useMemo(() => {
    if (typeof rowHeight === 'number') {
      return {
        positions: null,
        fixedTemplate: ` repeat(${rows.length}, ${rowHeight}px)`,
        totalRowHeight: rowHeight * rows.length,
        getRowTop: (rowIdx: number) => rowIdx * rowHeight,
        getRowHeight: () => rowHeight,
        getRowEstimate: () => rowHeight,
        findRowIdx: (offset: number) => floor(offset / rowHeight),
      };
    }

    // Computing all row heights upfront is an accepted performance cost. For a variable-height
    // indexing approach, see https://github.com/bvaughn/react-window/blob/b0a470cc264e9100afcaa1b78ed59d88f7914ad4/src/VariableSizeList.js#L68
    let totalRowHeight = 0;
    const positions = rows.map((row, rowIdx): RowPosition => {
      const estimate = rowHeight(row);
      const height = getMeasuredHeight?.(row, rowIdx) ?? estimate;
      const position = { top: totalRowHeight, height, estimate };
      totalRowHeight += height;
      return position;
    });

    // Header rows use the position of the closest row, or an empty position at the top when there are no rows
    const getRowPosition = (rowIdx: number): RowPosition => {
      if (positions.length === 0) return emptyRowPosition;
      return positions[max(0, min(positions.length - 1, rowIdx))];
    };

    return {
      positions,
      fixedTemplate: null,
      totalRowHeight,
      getRowTop: (rowIdx: number) => getRowPosition(rowIdx).top,
      getRowHeight: (rowIdx: number) => getRowPosition(rowIdx).height,
      getRowEstimate: (rowIdx: number) => getRowPosition(rowIdx).estimate,
      findRowIdx(offset: number) {
        let start = 0;
        let end = positions.length - 1;
        while (start <= end) {
          const middle = start + floor((end - start) / 2);
          const currentOffset = positions[middle].top;

          if (currentOffset === offset) return middle;

          if (currentOffset < offset) {
            start = middle + 1;
          } else if (currentOffset > offset) {
            end = middle - 1;
          }

          if (start > end) return end;
        }
        return 0;
      },
    };
  }, [rowHeight, rows, getMeasuredHeight]);

  const { positions, fixedTemplate, findRowIdx } = layout;

  let rowOverscanStartIdx = 0;
  let rowOverscanEndIdx = rows.length - 1;

  if (enableVirtualization) {
    if (measured && clientHeight > 0) {
      const overscanThreshold = 4;
      const rowVisibleStartIdx = findRowIdx(scrollTop);
      const rowVisibleEndIdx = findRowIdx(scrollTop + clientHeight);
      rowOverscanStartIdx = max(0, rowVisibleStartIdx - overscanThreshold);
      rowOverscanEndIdx = min(rows.length - 1, rowVisibleEndIdx + overscanThreshold);
    } else {
      // Layout not measured yet: render a bounded slice, not every row.
      rowOverscanEndIdx = min(rows.length - 1, unmeasuredRowCount - 1);
    }
  }

  // With measurement the template follows the render window: rendered rows may grow past their estimate
  // (minmax with max-content), the others hold the height they were measured at, so leaving the window moves nothing.
  const isMeasuring = getMeasuredHeight !== undefined;
  const windowStart = isMeasuring ? rowOverscanStartIdx : 0;
  const windowEnd = isMeasuring ? rowOverscanEndIdx : rows.length - 1;
  const gridTemplateRows = useMemo(() => {
    if (positions === null) return fixedTemplate ?? '';
    return buildTemplate(
      positions.map(({ height, estimate }, rowIdx) =>
        rowIdx >= windowStart && rowIdx <= windowEnd ? `minmax(${estimate}px,max-content)` : `${height}px`,
      ),
    );
  }, [positions, fixedTemplate, windowStart, windowEnd]);

  const { totalRowHeight, getRowTop, getRowHeight, getRowEstimate } = layout;
  return { rowOverscanStartIdx, rowOverscanEndIdx, totalRowHeight, gridTemplateRows, getRowTop, getRowHeight, getRowEstimate, findRowIdx };
}
