import { useMemo } from 'react';
import { floor, max, min } from '../utils/grid-utils';

/**
 * Rows rendered while the layout is not yet measured (a single pre-paint render
 * pass). Bounded so a large cached dataset doesn't render every row component
 * on first paint; the real overscan window replaces it as soon as the layout
 * effect commits its first measurement.
 */
const UNMEASURED_ROW_COUNT = 30;

interface ViewportRowsArgs<R> {
  rows: readonly R[];
  rowHeight: number | ((row: R) => number);
  clientHeight: number;
  scrollTop: number;
  enableVirtualization: boolean;
  measured: boolean;
}

export function useViewportRows<R>({
  rows,
  rowHeight,
  clientHeight,
  scrollTop,
  enableVirtualization,
  measured,
}: ViewportRowsArgs<R>) {
  const { totalRowHeight, gridTemplateRows, getRowTop, getRowHeight, findRowIdx } = useMemo(() => {
    if (typeof rowHeight === 'number') {
      return {
        totalRowHeight: rowHeight * rows.length,
        gridTemplateRows: ` repeat(${rows.length}, ${rowHeight}px)`,
        getRowTop: (rowIdx: number) => rowIdx * rowHeight,
        getRowHeight: () => rowHeight,
        findRowIdx: (offset: number) => floor(offset / rowHeight),
      };
    }

    // Computing all row heights upfront is an accepted performance cost. For a variable-height
    // indexing approach, see https://github.com/bvaughn/react-window/blob/b0a470cc264e9100afcaa1b78ed59d88f7914ad4/src/VariableSizeList.js#L68
    let totalRowHeight = 0;
    let gridTemplateRows = '';
    let currentHeight: number | null = null;
    let repeatCount = 0;

    // Uses minmax(Xpx, max-content) so rendered rows can grow beyond the estimate
    // while non-rendered rows stay at the estimated minimum.
    const flushRun = (height: number, count: number) => {
      const track = `minmax(${height}px,max-content)`;
      if (count > 1) {
        gridTemplateRows += `repeat(${count},${track}) `;
      } else {
        gridTemplateRows += `${track} `;
      }
    };

    const rowPositions = rows.map((row, index) => {
      const currentRowHeight = rowHeight(row);

      const position = {
        top: totalRowHeight,
        height: currentRowHeight,
      };
      totalRowHeight += currentRowHeight;

      if (currentHeight === null) {
        currentHeight = currentRowHeight;
        repeatCount = 1;
      } else if (currentHeight === currentRowHeight) {
        // If the current row height is the same as the previous one, increment the repeat count
        repeatCount++;
      } else {
        flushRun(currentHeight, repeatCount);
        currentHeight = currentRowHeight;
        repeatCount = 1;
      }

      if (index === rows.length - 1) {
        flushRun(currentHeight!, repeatCount);
      }

      return position;
    });

    const validateRowIdx = (rowIdx: number) => {
      return max(0, min(rows.length - 1, rowIdx));
    };

    return {
      totalRowHeight,
      gridTemplateRows,
      getRowTop: (rowIdx: number) => rowPositions[validateRowIdx(rowIdx)].top,
      getRowHeight: (rowIdx: number) => rowPositions[validateRowIdx(rowIdx)].height,
      findRowIdx(offset: number) {
        let start = 0;
        let end = rowPositions.length - 1;
        while (start <= end) {
          const middle = start + floor((end - start) / 2);
          const currentOffset = rowPositions[middle].top;

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
  }, [rowHeight, rows]);

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
      rowOverscanEndIdx = min(rows.length - 1, UNMEASURED_ROW_COUNT - 1);
    }
  }

  return {
    rowOverscanStartIdx,
    rowOverscanEndIdx,
    totalRowHeight,
    gridTemplateRows,
    getRowTop,
    getRowHeight,
    findRowIdx,
  };
}
