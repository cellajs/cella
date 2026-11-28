import { type HTMLMotionProps, motion, useReducedMotion } from 'motion/react';
import { memo } from 'react';
import { RowSelectionContext, type RowSelectionContextValue } from './hooks';
import type { RenderRowProps } from './types';
import { cn } from './utils/grid-utils';

// Rows are real subgrid boxes: column tracks still resolve at the root grid, and the row has a hit-test box for drag and drop and row-wide indicators.
const rowClassname = 'rdg-row group/row col-span-full grid grid-cols-subgrid aria-selected:bg-accent aria-selected:hover:bg-accent';

function Row<R, SR>({
  className,
  rowIdx,
  gridRowStart,
  height,
  selectedCellIdx,
  isRowSelectionDisabled,
  isRowSelected,
  row,
  viewportColumns,
  selectedCellEditor,
  onCellClick,
  rowClass,
  onRowChange,
  selectCell,
  renderCell,
  animateReorder,
  style,
  ...props
}: RenderRowProps<R, SR>) {
  const reducedMotion = useReducedMotion();

  className = cn(rowClassname, `rdg-row-${rowIdx % 2 === 0 ? 'even' : 'odd'}`, rowClass?.(row, rowIdx), className);

  const cells: React.ReactNode[] = [];

  for (const column of viewportColumns) {
    const isCellSelected = selectedCellIdx === column.idx;

    if (isCellSelected && selectedCellEditor) {
      cells.push(selectedCellEditor);
    } else {
      cells.push(
        renderCell(column.key, {
          column,
          row,
          rowIdx,
          isDraggedOver: false,
          isCellSelected,
          onCellClick,
          onRowChange,
          selectCell,
        }),
      );
    }
  }

  const selectionValue: RowSelectionContextValue = { isRowSelected, isRowSelectionDisabled };

  const rowStyle = { gridRowStart, '--rdg-row-height': `${height}px`, ...style };

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
export const defaultRenderRow = <R, SR>(key: React.Key, props: RenderRowProps<R, SR>) => <RowComponent key={key} {...props} />;
