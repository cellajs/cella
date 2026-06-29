import { memo } from 'react';
import { HeaderCell } from './header-cell';
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
  isCellSelectionEnabled: boolean;
  headerRowClass: Maybe<string>;
}

export const headerRowClassname = 'rdg-header-row contents font-semibold text-foreground/70';

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
  isCellSelectionEnabled,
}: HeaderRowProps<R, SR>) {
  const cells: React.ReactNode[] = [];
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
        isCellSelectionEnabled={isCellSelectionEnabled}
        onColumnResize={onColumnResize}
        onColumnResizeEnd={onColumnResizeEnd}
        onColumnsReorder={onColumnsReorder}
        onSortColumnsChange={onSortColumnsChange}
        sortColumns={sortColumns}
        selectCell={selectCell}
        shouldFocusGrid={shouldFocusGrid && index === 0}
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
          'rdg-row-selected': selectedCellIdx === -1,
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
