import { memo } from 'react';
import { headerRowClassname } from './header-row';
import { useRovingTabIndex } from './hooks';
import type { CalculatedColumn, CalculatedColumnParent, Position } from './types';
import { cn, getHeaderCellRowSpan, getHeaderCellStyle } from './utils/grid-utils';

interface GroupedColumnHeaderRowProps<R, SR> {
  rowIdx: number;
  level: number;
  columns: readonly CalculatedColumn<R, SR>[];
  selectCell: (position: Position) => void;
  selectedCellIdx: number | undefined;
}

function GroupedColumnHeaderRow<R, SR>({ rowIdx, level, columns, selectedCellIdx, selectCell }: GroupedColumnHeaderRowProps<R, SR>) {
  const cells: React.ReactNode[] = [];
  const renderedParents = new Set<CalculatedColumnParent<R, SR>>();

  for (const column of columns) {
    let { parent } = column;

    if (parent === undefined) continue;

    while (parent.level > level) {
      if (parent.parent === undefined) break;
      parent = parent.parent;
    }

    if (parent.level === level && !renderedParents.has(parent)) {
      renderedParents.add(parent);
      const { idx } = parent;
      cells.push(
        <GroupedColumnHeaderCell<R, SR> key={idx} column={parent} rowIdx={rowIdx} isCellSelected={selectedCellIdx === idx} selectCell={selectCell} />,
      );
    }
  }

  return (
    <div
      role="row"
      aria-rowindex={rowIdx} // aria-rowindex is 1 based
      className={headerRowClassname}
    >
      {cells}
    </div>
  );
}

const GroupedColumnHeaderRowMemo = memo(GroupedColumnHeaderRow) as <R, SR>(props: GroupedColumnHeaderRowProps<R, SR>) => React.JSX.Element;

export { GroupedColumnHeaderRowMemo as GroupedColumnHeaderRow };

interface GroupedColumnHeaderCellProps<R, SR> {
  rowIdx: number;
  selectCell: (position: Position) => void;
  column: CalculatedColumnParent<R, SR>;
  isCellSelected: boolean;
}

function GroupedColumnHeaderCell<R, SR>({ column, rowIdx, isCellSelected, selectCell }: GroupedColumnHeaderCellProps<R, SR>) {
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
      {...{ tabIndex, onFocus, onMouseDown }}
      className={cn('rdg-cell', column.headerCellClass)}
      style={{ ...getHeaderCellStyle(column, rowIdx, rowSpan), gridColumnStart: index, gridColumnEnd: index + colSpan }}
    >
      {column.name}
    </div>
  );
}
