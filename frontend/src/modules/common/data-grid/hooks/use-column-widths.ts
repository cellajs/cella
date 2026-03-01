import { useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import type { DataGridProps } from '../data-grid';
import type { CalculatedColumn, ColumnWidths, ResizedWidth } from '../types';

/**
 * Manages column widths for user-initiated resize operations only.
 *
 * Auto columns use CSS-native `minmax(min, 1fr)` — no JS measurement
 * needed for initial sizing or window resize. CSS grid handles flex
 * distribution natively between breakpoints.
 *
 * This hook only activates when a user explicitly resizes a column
 * (drag or double-click auto-resize).
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
    readonly width: ResizedWidth;
  } | null>(null);

  const newTemplateColumns = [...templateColumns];
  let needsMeasurement = false;

  // Only modify template for the column being actively resized by the user
  if (columnToAutoResize !== null) {
    for (const { key, idx } of columns) {
      if (key === columnToAutoResize.key) {
        newTemplateColumns[idx] =
          columnToAutoResize.width === 'max-content' ? columnToAutoResize.width : `${columnToAutoResize.width}px`;
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
    const { key: resizingKey } = column;

    flushSync(() => {
      setColumnToAutoResize({
        key: resizingKey,
        width: nextWidth,
      });
      setColumnResizing(typeof nextWidth === 'number');
    });

    if (onColumnResize) {
      const previousWidth = columnWidths.get(resizingKey)?.width;
      const newWidth = typeof nextWidth === 'number' ? nextWidth : measureColumnWidth(gridRef, resizingKey);
      if (newWidth !== undefined && newWidth !== previousWidth) {
        onColumnResize(column, newWidth);
      }
    }
  }

  return {
    gridTemplateColumns,
    handleColumnResize,
  } as const;
}

function measureColumnWidth(gridRef: React.RefObject<HTMLDivElement | null>, key: string) {
  const selector = `[data-measuring-cell-key="${CSS.escape(key)}"]`;
  const measuringCell = gridRef.current?.querySelector(selector);
  return measuringCell?.getBoundingClientRect().width;
}
