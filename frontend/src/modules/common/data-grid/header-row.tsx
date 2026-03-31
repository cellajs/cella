import { memo, useState } from 'react';
import { HeaderCell } from './header-cell';
import { rowSelectedClassname } from './style/row';
import type { CalculatedColumn, Maybe, Position, ResizedWidth, SortColumn } from './types';
import { cn, getColSpan } from './utils/grid-utils';

export interface HeaderRowProps<R, SR> {
  sortColumns?: Maybe<readonly SortColumn[]>;
  onSortColumnsChange?: Maybe<(sortColumns: SortColumn[]) => void>;
  onColumnsReorder?: Maybe<(sourceColumnKey: string, targetColumnKey: string) => void>;
  rowIdx: number;
  columns: readonly CalculatedColumn<R, SR>[];
  onColumnResize: (column: CalculatedColumn<R, SR>, width: ResizedWidth) => void;
  onColumnResizeEnd: () => void;
  selectCell: (position: Position) => void;
  lastFrozenColumnIndex: number;
  selectedCellIdx: number | undefined;
  shouldFocusGrid: boolean;
  headerRowClass: Maybe<string>;
  scrollTop?: number;
}

export const headerRowClassname = 'rdg-header-row';

function HeaderRow<R, SR>({
  headerRowClass,
  rowIdx,
  columns,
  onColumnResize,
  onColumnResizeEnd,
  onColumnsReorder,
  sortColumns,
  onSortColumnsChange,
  lastFrozenColumnIndex,
  selectedCellIdx,
  selectCell,
  shouldFocusGrid,
  scrollTop,
}: HeaderRowProps<R, SR>) {
  const [draggedColumnKey, setDraggedColumnKey] = useState<string>();

  const cells = [];
  for (let index = 0; index < columns.length; index++) {
    const column = columns[index];
    const colSpan = getColSpan(column, lastFrozenColumnIndex, { type: 'HEADER' });
    if (colSpan !== undefined) {
      index += colSpan - 1;
    }

    cells.push(
      <HeaderCell<R, SR>
        key={column.key}
        column={column}
        colSpan={colSpan}
        rowIdx={rowIdx}
        isCellSelected={selectedCellIdx === column.idx}
        onColumnResize={onColumnResize}
        onColumnResizeEnd={onColumnResizeEnd}
        onColumnsReorder={onColumnsReorder}
        onSortColumnsChange={onSortColumnsChange}
        sortColumns={sortColumns}
        selectCell={selectCell}
        shouldFocusGrid={shouldFocusGrid && index === 0}
        draggedColumnKey={draggedColumnKey}
        setDraggedColumnKey={setDraggedColumnKey}
        scrollTop={scrollTop}
      />,
    );
  }

  return (
    <div
      role="row"
      aria-rowindex={rowIdx} // aria-rowindex is 1 based
      className={cn(
        headerRowClassname,
        {
          [rowSelectedClassname]: selectedCellIdx === -1,
        },
        headerRowClass,
      )}
    >
      {cells}
    </div>
  );
}

const HeaderRowMemo = memo(HeaderRow) as <R, SR>(props: HeaderRowProps<R, SR>) => React.JSX.Element;

export { HeaderRowMemo as HeaderRow };
