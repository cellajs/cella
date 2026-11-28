import { memo } from 'react';
import { HeaderCell } from './header-cell';
import type { CalculatedColumn, Maybe, ResizedWidth, SortColumn } from './types';

interface HeaderRowProps<R, SR> {
  sortColumns?: Maybe<readonly SortColumn[]>;
  onSortColumnsChange?: Maybe<(sortColumns: SortColumn[]) => void>;
  columns: readonly CalculatedColumn<R, SR>[];
  onColumnResize: (column: CalculatedColumn<R, SR>, width: ResizedWidth) => void;
  onColumnResizeEnd: () => void;
  /** Selects the header cell of the column at this index. */
  selectCell: (idx: number) => void;
  selectedCellIdx: number | undefined;
  shouldFocusGrid: boolean;
}

function HeaderRow<R, SR>({
  columns,
  onColumnResize,
  onColumnResizeEnd,
  sortColumns,
  onSortColumnsChange,
  selectedCellIdx,
  selectCell,
  shouldFocusGrid,
}: HeaderRowProps<R, SR>) {
  return (
    <div
      role="row"
      aria-rowindex={1} // aria-rowindex is 1 based
      className="rdg-header-row group-label contents"
    >
      {columns.map((column, index) => (
        <HeaderCell<R, SR>
          key={column.key}
          column={column}
          {...{ onColumnResize, onColumnResizeEnd, onSortColumnsChange, sortColumns, selectCell }}
          isCellSelected={selectedCellIdx === column.idx}
          shouldFocusGrid={shouldFocusGrid && index === 0}
        />
      ))}
    </div>
  );
}

const HeaderRowMemo = memo(HeaderRow) as <R, SR>(props: HeaderRowProps<R, SR>) => React.JSX.Element;

export { HeaderRowMemo as HeaderRow };
