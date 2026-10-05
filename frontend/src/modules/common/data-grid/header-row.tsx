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

export const headerRowClassname = 'rdg-header-row contents font-semibold text-muted-foreground';

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
  // The drag that reorders columns has no key of its own, so Ctrl+Shift+Arrow steps one column past its neighbour.
  const moveColumn = onColumnsReorder
    ? (column: CalculatedColumn<R, SR>, step: -1 | 1) => {
        const target = columns[column.idx + step];
        if (!target?.draggable) return false;
        onColumnsReorder(column.key, target.key);
        return true;
      }
    : undefined;

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
        moveColumn={moveColumn}
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
      className={cn(headerRowClassname, headerRowClass)}
    >
      {cells}
    </div>
  );
}

const HeaderRowMemo = memo(HeaderRow) as <R, SR>(props: HeaderRowProps<R, SR>) => React.JSX.Element;

export { HeaderRowMemo as HeaderRow };
