import { GripVerticalIcon } from 'lucide-react';
import { useContext } from 'react';
import { RowDragHandleContext } from '~/modules/common/data-grid/row-drag';
import { SrOnlyHeader } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { ReorderHandle, type ReorderPosition } from '~/modules/common/reorder-handle/reorder-handle';
import { cn } from '~/utils/cn';

interface ReorderColumnOptions<TRow> {
  /** The row's id, so focus follows the row to its new place. */
  getId: (row: TRow) => string;
  /** The row name the grip announces. */
  getName: (row: TRow) => string;
  /** Steps the row at `rowIdx` one place, with the table's own persist. */
  onMove: (rowIdx: number, step: -1 | 1) => void;
  rowCount: number;
  /** A tree's place among siblings; by default the row's place in the table. */
  getPosition?: (rowIdx: number) => ReorderPosition;
  /** A tree's outdent (-1) and indent (1), returning the new place or null. */
  onShift?: (rowIdx: number, direction: -1 | 1) => ReorderPosition | null;
  /** Extra classes for the grip's cell, for a table that places it itself. */
  cellClass?: string;
}

/** Grip column of a reorderable table: a drag calls the grid's `onRowReorder`, the arrow keys and the move menu call `onMove`. */
export function reorderColumn<TRow>({
  getId,
  getName,
  onMove,
  rowCount,
  getPosition,
  onShift,
  cellClass,
}: ReorderColumnOptions<TRow>): ColumnOrColumnGroup<TRow> {
  return {
    key: 'reorder',
    name: '',
    width: 36,
    maxWidth: 36,
    cellClass: cn('justify-center', cellClass),
    rowDragHandle: true,
    renderHeaderCell: () => <SrOnlyHeader label="c:order" />,
    renderCell: ({ row, rowIdx, tabIndex }) => {
      const { index, total } = getPosition?.(rowIdx) ?? { index: rowIdx, total: rowCount };
      return (
        <ReorderCell
          id={getId(row)}
          name={getName(row)}
          index={index}
          total={total}
          tabIndex={tabIndex}
          onMove={(step) => onMove(rowIdx, step)}
          onShift={onShift && ((direction) => onShift(rowIdx, direction))}
        />
      );
    },
  };
}

interface ReorderCellProps extends ReorderPosition {
  id: string;
  name: string;
  tabIndex: number;
  onMove: (step: -1 | 1) => void;
  onShift?: (direction: -1 | 1) => ReorderPosition | null;
}

function ReorderCell(props: ReorderCellProps) {
  const registerHandle = useContext(RowDragHandleContext);
  return (
    <ReorderHandle
      {...props}
      ref={registerHandle}
      className="flex size-7 cursor-grab items-center justify-center rounded-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground active:cursor-grabbing data-popup-open:bg-accent/50 data-popup-open:text-foreground"
    >
      <GripVerticalIcon className="size-3.5" />
    </ReorderHandle>
  );
}
