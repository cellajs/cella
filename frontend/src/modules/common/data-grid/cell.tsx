import { type MouseEvent, memo } from 'react';

import { useRovingTabIndex } from './hooks';
import type { CellMouseEventHandler, CellRendererProps } from './types';
import { createCellEvent, getCellClassname, getCellStyle, isCellEditableUtil } from './utils';

const cellDraggedOverClassname = 'rdg-cell-dragged-over';
const cellInRangeClassname = 'rdg-cell-range-selected';
const cellRangeTopClassname = 'rdg-cell-range-top';
const cellRangeBottomClassname = 'rdg-cell-range-bottom';
const cellRangeLeftClassname = 'rdg-cell-range-left';
const cellRangeRightClassname = 'rdg-cell-range-right';

function Cell<R, SR>({
  column,
  colSpan,
  isCellSelected,
  isInSelectedRange,
  rangeBoundary,
  isDraggedOver,
  row,
  rowIdx,
  className,
  onMouseDown,
  onCellMouseDown,
  onClick,
  onCellClick,
  onDoubleClick,
  onCellDoubleClick,
  onContextMenu,
  onCellContextMenu,
  onRowChange,
  selectCell,
  style,
  ...props
}: CellRendererProps<R, SR>) {
  const { tabIndex, childTabIndex, onFocus } = useRovingTabIndex(isCellSelected);

  const { cellClass } = column;

  className = getCellClassname(
    column,
    {
      [cellDraggedOverClassname]: isDraggedOver,
      [cellInRangeClassname]: isInSelectedRange === true,
      [cellRangeTopClassname]: isInSelectedRange === true && (rangeBoundary?.isTop ?? false),
      [cellRangeBottomClassname]: isInSelectedRange === true && (rangeBoundary?.isBottom ?? false),
      [cellRangeLeftClassname]: isInSelectedRange === true && (rangeBoundary?.isLeft ?? false),
      [cellRangeRightClassname]: isInSelectedRange === true && (rangeBoundary?.isRight ?? false),
    },
    typeof cellClass === 'function' ? cellClass(row) : cellClass,
    className,
  );
  const isEditable = isCellEditableUtil(column, row);

  // Non-focusable columns get tabIndex -1
  const effectiveTabIndex = column.focusable === false ? -1 : tabIndex;

  function selectCellWrapper(enableEditor?: boolean) {
    selectCell({ rowIdx, idx: column.idx }, { enableEditor });
  }

  function handleMouseEvent(event: React.MouseEvent<HTMLDivElement>, eventHandler?: CellMouseEventHandler<R, SR>) {
    let eventHandled = false;
    if (eventHandler) {
      const cellEvent = createCellEvent(event);
      eventHandler({ rowIdx, row, column, selectCell: selectCellWrapper }, cellEvent);
      eventHandled = cellEvent.isGridDefaultPrevented();
    }
    return eventHandled;
  }

  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    onMouseDown?.(event);
    if (!handleMouseEvent(event, onCellMouseDown)) {
      // select cell if the event is not prevented
      selectCell({ rowIdx, idx: column.idx }, { extendSelection: event.shiftKey });
    }
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    onClick?.(event);
    handleMouseEvent(event, onCellClick);
  }

  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    onDoubleClick?.(event);
    if (!handleMouseEvent(event, onCellDoubleClick)) {
      // go into edit mode if the event is not prevented
      selectCellWrapper(true);
    }
  }

  function handleContextMenu(event: MouseEvent<HTMLDivElement>) {
    onContextMenu?.(event);
    handleMouseEvent(event, onCellContextMenu);
  }

  function handleRowChange(newRow: R) {
    onRowChange(column, newRow);
  }

  return (
    <div
      role="gridcell"
      aria-colindex={column.idx + 1} // aria-colindex is 1-based
      aria-colspan={colSpan}
      aria-selected={isCellSelected || isInSelectedRange}
      aria-readonly={!isEditable || undefined}
      tabIndex={effectiveTabIndex}
      className={className}
      style={{
        ...getCellStyle(column, colSpan),
        ...style,
      }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onFocus={onFocus}
      {...props}
    >
      {column.renderCell({
        column,
        row,
        rowIdx,
        isCellEditable: isEditable,
        tabIndex: childTabIndex,
        onRowChange: handleRowChange,
      })}
    </div>
  );
}

export const CellComponent = memo(Cell) as <R, SR>(props: CellRendererProps<R, SR>) => React.JSX.Element;
export function defaultRenderCell<R, SR>(key: React.Key, props: CellRendererProps<R, SR>) {
  return <CellComponent key={key} {...props} />;
}
