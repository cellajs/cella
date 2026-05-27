import { useRovingTabIndex } from './hooks';
import type { CalculatedColumnParent, Position } from './types';
import { cn, getHeaderCellRowSpan, getHeaderCellStyle } from './utils/grid-utils';

interface GroupedColumnHeaderCellProps<R, SR> {
  rowIdx: number;
  selectCell: (position: Position) => void;
  column: CalculatedColumnParent<R, SR>;
  isCellSelected: boolean;
  isCellSelectionEnabled: boolean;
}

export function GroupedColumnHeaderCell<R, SR>({
  column,
  rowIdx,
  isCellSelected,
  isCellSelectionEnabled,
  selectCell,
}: GroupedColumnHeaderCellProps<R, SR>) {
  const roving = useRovingTabIndex(isCellSelected);
  const tabIndex = isCellSelectionEnabled ? roving.tabIndex : -1;
  const onFocus = isCellSelectionEnabled ? roving.onFocus : undefined;
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
      className={cn('rdg-cell', column.headerCellClass)}
      style={{
        ...getHeaderCellStyle(column, rowIdx, rowSpan),
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
