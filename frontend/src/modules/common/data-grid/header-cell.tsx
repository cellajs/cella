import { useRef } from 'react';
import { useRovingTabIndex } from './hooks';
import type { CalculatedColumn, Maybe, ResizedWidth, SortColumn } from './types';
import {
  clampColumnWidth,
  getCellClassname,
  getCellStyle,
  getMergedHeaderPadding,
  headerCellFocusRing,
  isCtrlKeyHeldDown,
  stopPropagation,
} from './utils/grid-utils';

interface HeaderCellProps<R, SR> {
  sortColumns?: Maybe<readonly SortColumn[]>;
  onSortColumnsChange?: Maybe<(sortColumns: SortColumn[]) => void>;
  selectCell: (idx: number) => void;
  onColumnResize: (column: CalculatedColumn<R, SR>, width: ResizedWidth) => void;
  onColumnResizeEnd: () => void;
  shouldFocusGrid: boolean;
  column: CalculatedColumn<R, SR>;
  isCellSelected: boolean;
}

export function HeaderCell<R, SR>({
  column,
  isCellSelected,
  onColumnResize,
  onColumnResizeEnd,
  sortColumns,
  onSortColumnsChange,
  selectCell,
  shouldFocusGrid,
}: HeaderCellProps<R, SR>) {
  // set the tabIndex to 0 when there is no selected cell so grid can receive focus
  const { tabIndex, childTabIndex, onFocus } = useRovingTabIndex(shouldFocusGrid || isCellSelected);
  const sortIndex = sortColumns?.findIndex((sort) => sort.columnKey === column.key);
  const sortColumn = sortIndex !== undefined && sortIndex > -1 ? sortColumns![sortIndex] : undefined;
  const sortDirection = sortColumn?.direction;
  const priority = sortColumn !== undefined && sortColumns!.length > 1 ? sortIndex! + 1 : undefined;
  const ariaSort = sortDirection && !priority ? (sortDirection === 'ASC' ? 'ascending' : 'descending') : undefined;
  const { sortable, resizable } = column;

  const className = getCellClassname(column, headerCellFocusRing, 'border-t-0', column.headerCellClass, {
    'cursor-pointer': sortable,
    'touch-none': resizable,
  });

  function onSort(ctrlClick: boolean) {
    if (onSortColumnsChange == null) return;
    const { sortDescendingFirst } = column;
    if (sortColumn === undefined) {
      const nextSort: SortColumn = { columnKey: column.key, direction: sortDescendingFirst ? 'DESC' : 'ASC' };
      onSortColumnsChange(sortColumns && ctrlClick ? [...sortColumns, nextSort] : [nextSort]);
    } else {
      let nextSortColumn: SortColumn | undefined;
      if ((sortDescendingFirst === true && sortDirection === 'DESC') || (sortDescendingFirst !== true && sortDirection === 'ASC')) {
        nextSortColumn = { columnKey: column.key, direction: sortDirection === 'ASC' ? 'DESC' : 'ASC' };
      }
      if (ctrlClick) {
        const nextSortColumns = [...sortColumns!];
        if (nextSortColumn) nextSortColumns[sortIndex!] = nextSortColumn;
        else nextSortColumns.splice(sortIndex!, 1);
        onSortColumnsChange(nextSortColumns);
      } else {
        onSortColumnsChange(nextSortColumn ? [nextSortColumn] : []);
      }
    }
  }

  function handleFocus(event: React.FocusEvent<HTMLDivElement>) {
    onFocus?.(event);
    if (shouldFocusGrid) selectCell(0);
  }

  function onMouseDown() {
    selectCell(column.idx);
  }

  function onClick(event: React.MouseEvent<HTMLSpanElement>) {
    if (sortable) onSort(event.ctrlKey || event.metaKey);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLSpanElement>) {
    const { key } = event;
    if (sortable && (key === ' ' || key === 'Enter')) {
      // prevent scrolling
      event.preventDefault();
      onSort(event.ctrlKey || event.metaKey);
    } else if (resizable && !event.shiftKey && isCtrlKeyHeldDown(event) && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      // stopPropagation prevents grid navigation during column resize
      event.stopPropagation();
      const { width } = event.currentTarget.getBoundingClientRect();
      const offset = key === 'ArrowLeft' ? -10 : 10;
      const newWidth = clampColumnWidth(width + offset, column);
      if (newWidth === width) return;
      // Each key press is a whole resize: the next one, on any column, measures the widths anew
      onColumnResize(column, newWidth);
      onColumnResizeEnd();
    }
  }

  // Row 1 explicitly: the measuring cells hold row 1 of every column track, and an auto-placed header would drop below them
  const style: React.CSSProperties = { ...getCellStyle(column), gridRowStart: 1, paddingInlineStart: getMergedHeaderPadding(column) };

  const content = column.renderHeaderCell({ column, sortDirection, priority, tabIndex: childTabIndex });

  return (
    <div
      role="columnheader"
      aria-colindex={column.idx + 1}
      aria-selected={isCellSelected}
      aria-sort={ariaSort}
      // On the cell itself: a keyboard focus lands here, and the tooltip looks up from its target
      {...(column.icon && typeof column.name === 'string' && { 'data-tooltip': 'slim', 'data-tooltip-content': column.name })}
      {...{ tabIndex, className, style, onMouseDown, onClick, onKeyDown }}
      onFocus={handleFocus}
    >
      {content}

      {resizable && <ResizeHandle column={column} onColumnResize={onColumnResize} onColumnResizeEnd={onColumnResizeEnd} />}
    </div>
  );
}

type ResizeHandleProps<R, SR> = Pick<HeaderCellProps<R, SR>, 'column' | 'onColumnResize' | 'onColumnResizeEnd'>;

function ResizeHandle<R, SR>({ column, onColumnResize, onColumnResizeEnd }: ResizeHandleProps<R, SR>) {
  const resizingOffsetRef = useRef<number>(undefined);
  const initialLeftRef = useRef<number>(undefined);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    // Grabbing the handle does not select its header cell: a cancelled pointerdown sends no compatibility mousedown
    event.preventDefault();

    const { currentTarget, pointerId } = event;
    currentTarget.setPointerCapture(pointerId);
    const headerCell = currentTarget.parentElement!;
    const { right, left } = headerCell.getBoundingClientRect();
    resizingOffsetRef.current = right - event.clientX;
    // Capture stable left edge for consistent width calculation during overflow
    initialLeftRef.current = left;
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const offset = resizingOffsetRef.current;
    const initialLeft = initialLeftRef.current;
    if (offset === undefined || initialLeft === undefined) return;
    const { width } = event.currentTarget.parentElement!.getBoundingClientRect();
    // Use initial left edge so left-side column shifts don't eat the drag delta
    const newWidth = event.clientX + offset - initialLeft;
    if (width > 0 && newWidth !== width) onColumnResize(column, newWidth);
  }

  function onLostPointerCapture() {
    onColumnResizeEnd();
    resizingOffsetRef.current = undefined;
    initialLeftRef.current = undefined;
  }

  function onDoubleClick() {
    onColumnResize(column, 'max-content');
  }

  return (
    <div
      aria-hidden
      className='after:bg-foreground/30 hover:after:bg-primary/80 absolute inset-y-0 inset-e-0 w-4 cursor-col-resize after:absolute after:inset-e-0 after:top-1/2 after:h-4 after:w-0.5 after:-translate-y-1/2 after:rounded-full after:content-[""]'
      onClick={stopPropagation}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      // pointerup does not fire after pointer down -> alt+tab -> pointer up over another window.
      onLostPointerCapture={onLostPointerCapture}
      onDoubleClick={onDoubleClick}
    />
  );
}
