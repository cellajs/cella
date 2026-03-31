import { useRovingTabIndex } from './hooks';
import { cellClassname } from './style/cell';
import type { CalculatedColumnParent, Position } from './types';
import { cn, getHeaderCellRowSpan, getHeaderCellStyle } from './utils/grid-utils';

interface GroupedColumnHeaderCellProps<R, SR> {
  rowIdx: number;
  selectCell: (position: Position) => void;
  column: CalculatedColumnParent<R, SR>;
  isCellSelected: boolean;
  scrollTop?: number;
}

export function GroupedColumnHeaderCell<R, SR>({
  column,
  rowIdx,
  isCellSelected,
  selectCell,
  scrollTop,
}: GroupedColumnHeaderCellProps<R, SR>) {
  const { tabIndex, onFocus } = useRovingTabIndex(isCellSelected);
  const { colSpan } = column;
  const rowSpan = getHeaderCellRowSpan(column, rowIdx);
  const index = column.idx + 1;

  function onMouseDown() {
    selectCell({ idx: column.idx, rowIdx });
  }

  return (
    <div
      role="columnheader"
      aria-colindex={index}
      aria-colspan={colSpan}
      aria-rowspan={rowSpan}
      aria-selected={isCellSelected}
      tabIndex={tabIndex}
      className={cn(cellClassname, column.headerCellClass)}
      style={{
        ...getHeaderCellStyle(column, rowIdx, rowSpan, scrollTop),
        gridColumnStart: index,
        gridColumnEnd: index + colSpan,
      }}
      onFocus={onFocus}
      onMouseDown={onMouseDown}
    >
      {column.name}
    </div>
  );
}
