import type { GroupedColumnHeaderRowProps } from './grouped-column-header-row';
import { useRovingTabIndex } from './hooks';
import { cellClassname } from './style/cell';
import type { CalculatedColumnParent } from './types';
import { classnames, getHeaderCellRowSpan, getHeaderCellStyle } from './utils';

type SharedGroupedColumnHeaderRowProps<R, SR> = Pick<GroupedColumnHeaderRowProps<R, SR>, 'rowIdx' | 'selectCell'>;

interface GroupedColumnHeaderCellProps<R, SR> extends SharedGroupedColumnHeaderRowProps<R, SR> {
  column: CalculatedColumnParent<R, SR>;
  isCellSelected: boolean;
}

export function GroupedColumnHeaderCell<R, SR>({
  column,
  rowIdx,
  isCellSelected,
  selectCell,
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
      className={classnames(cellClassname, column.headerCellClass)}
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
