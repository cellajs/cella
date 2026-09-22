import { type HTMLMotionProps, motion, useReducedMotion } from 'motion/react';
import { memo, useMemo } from 'react';
import { RowSelectionContext, type RowSelectionContextValue } from './hooks';
import type { RenderRowProps } from './types';
import { cn, getCellRangeBoundary, getColSpan, isCellInRange } from './utils/grid-utils';

// Rows are real subgrid boxes: column tracks still resolve at the root grid, and the row has a hit-test box for drag and drop and row-wide indicators.
const rowClassname =
  'rdg-row group/row col-span-full grid grid-cols-subgrid aria-selected:bg-accent aria-selected:hover:bg-accent';

function Row<R, SR>({
  className,
  rowIdx,
  gridRowStart,
  selectedCellIdx,
  isRowSelectionDisabled,
  isRowSelected,
  lastFrozenColumnIndex,
  row,
  viewportColumns,
  selectedCellEditor,
  onCellMouseDown,
  onCellClick,
  onCellDoubleClick,
  onCellContextMenu,
  rowClass,
  onRowChange,
  selectCell,
  renderCell,
  selectedCellRange,
  isCellSelectionEnabled,
  animateReorder,
  style,
  ...props
}: RenderRowProps<R, SR>) {
  const reducedMotion = useReducedMotion();

  className = cn(rowClassname, `rdg-row-${rowIdx % 2 === 0 ? 'even' : 'odd'}`, rowClass?.(row, rowIdx), className);

  const cells: React.ReactNode[] = [];

  for (let index = 0; index < viewportColumns.length; index++) {
    const column = viewportColumns[index];
    const { idx } = column;
    const colSpan = getColSpan(column, lastFrozenColumnIndex, { type: 'ROW', row });
    if (colSpan !== undefined) {
      index += colSpan - 1;
    }

    const isCellSelected = selectedCellIdx === idx;

    const position = { idx, rowIdx };
    const isInSelectedRange = selectedCellRange ? isCellInRange(position, selectedCellRange) : false;
    const rangeBoundary =
      isInSelectedRange && selectedCellRange ? getCellRangeBoundary(position, selectedCellRange) : undefined;

    if (isCellSelected && selectedCellEditor) {
      cells.push(selectedCellEditor);
    } else {
      cells.push(
        renderCell(column.key, {
          column,
          colSpan,
          row,
          rowIdx,
          isDraggedOver: false,
          isCellSelected,
          isCellSelectionEnabled,
          isInSelectedRange,
          rangeBoundary,
          onCellMouseDown,
          onCellClick,
          onCellDoubleClick,
          onCellContextMenu,
          onRowChange,
          selectCell,
        }),
      );
    }
  }

  const selectionValue = useMemo(
    (): RowSelectionContextValue => ({ isRowSelected, isRowSelectionDisabled }),
    [isRowSelectionDisabled, isRowSelected],
  );

  const rowStyle = { gridRowStart, ...style };

  if (animateReorder) {
    return (
      <RowSelectionContext value={selectionValue}>
        <motion.div
          role="row"
          // Position-only layout animation: rows keep their size on reorder, and scaling would distort cell borders.
          layout={reducedMotion ? false : 'position'}
          className={className}
          style={rowStyle}
          // React's DOM drag and animation handler types collide with motion's same-named props; the runtime props are compatible.
          {...(props as unknown as HTMLMotionProps<'div'>)}
        >
          {cells}
        </motion.div>
      </RowSelectionContext>
    );
  }

  return (
    <RowSelectionContext value={selectionValue}>
      <div role="row" className={className} style={rowStyle} {...props}>
        {cells}
      </div>
    </RowSelectionContext>
  );
}

const RowComponent = memo(Row) as <R, SR>(props: RenderRowProps<R, SR>) => React.JSX.Element;
export function defaultRenderRow<R, SR>(key: React.Key, props: RenderRowProps<R, SR>) {
  return <RowComponent key={key} {...props} />;
}
