import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { DataGridProps } from '../data-grid';
import type { CalculatedColumn, ColumnWidth, ColumnWidths, ResizedWidth } from '../types';
import { clampColumnWidth, max, min } from '../utils/grid-utils';

interface ResizeSnapshot<R, SR> {
  readonly resizingCol: CalculatedColumn<R, SR>;
  readonly initialWidth: number;
  readonly allWidths: ReadonlyMap<string, number>;
  /** Non-frozen columns to the right of the handle */
  readonly rightCols: readonly CalculatedColumn<R, SR>[];
  /** Non-frozen columns to the left of the handle, nearest-first */
  readonly leftCols: readonly CalculatedColumn<R, SR>[];
}

/** Get column width from the widths map with minWidth fallback */
function getWidth<R, SR>(widths: ReadonlyMap<string, number>, col: CalculatedColumn<R, SR>): number {
  return widths.get(col.key) ?? col.minWidth;
}

/**
 * Manages column widths for user-initiated resize operations.
 *
 * Auto columns use CSS-native `minmax(min, 1fr)` — no JS measurement
 * needed for initial sizing or window resize.
 *
 * During drag resize, ALL columns are fixed to pixel widths and space is
 * actively redistributed. Columns to the right absorb the inverse delta:
 * widening shrinks right columns (neighbor first), narrowing grows them.
 * Dragging past minWidth overflows to shrink left columns too.
 *
 * On resize end, temporary widths promote to 'resized' so flex sizing
 * is restored for columns the user did not explicitly resize.
 */
export function useColumnWidths<R, SR>(
  columns: readonly CalculatedColumn<R, SR>[],
  templateColumns: readonly string[],
  gridRef: React.RefObject<HTMLDivElement | null>,
  columnWidths: ColumnWidths,
  onColumnWidthsChange: (columnWidths: ColumnWidths) => void,
  onColumnResize: DataGridProps<R, SR>['onColumnResize'],
  setColumnResizing: (isColumnResizing: boolean) => void,
) {
  const [columnToAutoResize, setColumnToAutoResize] = useState<{
    readonly key: string;
    readonly width: 'max-content';
  } | null>(null);

  const resizeSnapshotRef = useRef<ResizeSnapshot<R, SR> | null>(null);

  const newTemplateColumns = [...templateColumns];
  let needsMeasurement = false;

  if (columnToAutoResize !== null) {
    for (const { key, idx } of columns) {
      if (key === columnToAutoResize.key) {
        newTemplateColumns[idx] = 'max-content';
        needsMeasurement = true;
        break;
      }
    }
  }

  const gridTemplateColumns = newTemplateColumns.join(' ');

  useLayoutEffect(() => {
    if (!needsMeasurement || columnToAutoResize === null) return;

    const resizingKey = columnToAutoResize.key;
    const oldWidth = columnWidths.get(resizingKey)?.width;
    const newWidth = measureColumnWidth(gridRef, resizingKey);

    if (newWidth !== undefined && oldWidth !== newWidth) {
      const newColumnWidths = new Map(columnWidths);
      newColumnWidths.set(resizingKey, { type: 'resized', width: newWidth });
      onColumnWidthsChange(newColumnWidths);
    }

    setColumnToAutoResize(null);
  });

  function handleColumnResize(column: CalculatedColumn<R, SR>, nextWidth: ResizedWidth) {
    // Double-click auto-resize: use CSS measurement flow
    if (nextWidth === 'max-content') {
      flushSync(() => {
        setColumnToAutoResize({ key: column.key, width: nextWidth });
        setColumnResizing(false);
      });

      if (onColumnResize) {
        const newWidth = measureColumnWidth(gridRef, column.key);
        if (newWidth !== undefined) {
          onColumnResize(column, newWidth);
        }
      }
      return;
    }

    // Snapshot all widths and neighbor lists on first move
    if (!resizeSnapshotRef.current) {
      const allWidths = measureAllColumnWidths(gridRef);
      resizeSnapshotRef.current = {
        resizingCol: column,
        initialWidth: allWidths.get(column.key) ?? 0,
        allWidths,
        rightCols: columns.slice(column.idx + 1).filter((c) => !c.frozen),
        leftCols: columns
          .slice(0, column.idx)
          .filter((c) => !c.frozen)
          .reverse(),
      };
    }

    const redistributed = redistributeWidths(resizeSnapshotRef.current, nextWidth);
    const actualWidth = redistributed.get(column.key) ?? clampColumnWidth(nextWidth, column);

    const newColumnWidths = new Map(columnWidths);
    for (const col of columns) {
      const w = redistributed.get(col.key);
      if (w !== undefined) {
        newColumnWidths.set(col.key, {
          type: col.key === column.key ? 'resized' : 'measured',
          width: w,
        });
      }
    }

    flushSync(() => {
      onColumnWidthsChange(newColumnWidths);
      setColumnResizing(true);
    });

    onColumnResize?.(column, actualWidth);
  }

  function handleColumnResizeEnd() {
    if (!resizeSnapshotRef.current) return;
    resizeSnapshotRef.current = null;

    // Promote measured → resized to prevent jump on drop
    const newColumnWidths = new Map<string, ColumnWidth>();
    for (const [key, value] of columnWidths) {
      newColumnWidths.set(key, value.type === 'measured' ? { type: 'resized', width: value.width } : value);
    }
    onColumnWidthsChange(newColumnWidths);
  }

  return {
    gridTemplateColumns,
    handleColumnResize,
    handleColumnResizeEnd,
  } as const;
}

/**
 * Redistribute space when the resized column changes width.
 *
 * Widening (drag right): right neighbor shrinks first, then others proportionally.
 * Narrowing (drag left): freed space grows right columns equally.
 * Overflow past minWidth: left columns shrink (neighbor first), freed space also grows right.
 */
function redistributeWidths<R, SR>(snapshot: ResizeSnapshot<R, SR>, rawWidth: number): Map<string, number> {
  const { resizingCol, initialWidth, allWidths, rightCols, leftCols } = snapshot;

  const resizedWidth = max(
    resizingCol.minWidth,
    resizingCol.maxWidth != null ? min(rawWidth, resizingCol.maxWidth) : rawWidth,
  );
  const delta = resizedWidth - initialWidth;
  const overflow = max(0, resizingCol.minWidth - rawWidth);

  const newWidths = new Map(allWidths);
  newWidths.set(resizingCol.key, resizedWidth);

  if (delta === 0 && overflow === 0) return newWidths;

  if (delta > 0) {
    shrinkColumns(rightCols, newWidths, delta);
  } else if (delta < 0) {
    growColumns(rightCols, newWidths, -delta);
  }

  if (overflow > 0 && leftCols.length > 0) {
    const actualShrunk = shrinkColumns(leftCols, newWidths, overflow);
    if (actualShrunk > 0) {
      growColumns(rightCols, newWidths, actualShrunk);
    }
  }

  return newWidths;
}

/**
 * Shrink columns by `amount`: first in array shrinks first (nearest neighbor),
 * then remaining shrink proportionally. Returns actual amount shrunk.
 */
function shrinkColumns<R, SR>(
  cols: readonly CalculatedColumn<R, SR>[],
  widths: Map<string, number>,
  amount: number,
): number {
  if (cols.length === 0 || amount <= 0) return 0;
  let remaining = amount;

  // Nearest neighbor first
  const neighbor = cols[0];
  const neighborWidth = getWidth(widths, neighbor);
  const neighborTake = min(remaining, max(0, neighborWidth - neighbor.minWidth));
  widths.set(neighbor.key, neighborWidth - neighborTake);
  remaining -= neighborTake;

  // Remaining columns proportionally
  if (remaining > 0 && cols.length > 1) {
    const others = cols.slice(1);
    const totalAvailable = others.reduce((sum, col) => sum + max(0, getWidth(widths, col) - col.minWidth), 0);

    if (totalAvailable > 0) {
      const take = min(remaining, totalAvailable);
      for (const col of others) {
        const w = getWidth(widths, col);
        const share = ((w - col.minWidth) / totalAvailable) * take;
        widths.set(col.key, max(col.minWidth, w - share));
      }
      remaining -= take;
    }
  }

  return amount - remaining;
}

/** Grow columns equally by distributing `amount`. Reads current widths so growth stacks. */
function growColumns<R, SR>(
  cols: readonly CalculatedColumn<R, SR>[],
  widths: Map<string, number>,
  amount: number,
): void {
  if (cols.length === 0 || amount <= 0) return;
  const share = amount / cols.length;
  for (const col of cols) {
    widths.set(col.key, getWidth(widths, col) + share);
  }
}

function measureColumnWidth(gridRef: React.RefObject<HTMLDivElement | null>, key: string) {
  const selector = `[data-measuring-cell-key="${CSS.escape(key)}"]`;
  return gridRef.current?.querySelector(selector)?.getBoundingClientRect().width;
}

/** Measure all column widths in a single DOM query. */
function measureAllColumnWidths(gridRef: React.RefObject<HTMLDivElement | null>): Map<string, number> {
  const widths = new Map<string, number>();
  const cells = gridRef.current?.querySelectorAll<HTMLElement>('[data-measuring-cell-key]');
  if (cells) {
    for (const cell of cells) {
      const key = cell.dataset.measuringCellKey;
      if (key) widths.set(key, cell.getBoundingClientRect().width);
    }
  }
  return widths;
}
