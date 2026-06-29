import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { dropTargetForElements, draggable as makeDraggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DropIndicator } from '~/modules/common/drop-indicator';
import { useRovingTabIndex } from './hooks';
import type { CalculatedColumn, Maybe, Position, ResizedWidth, SortColumn } from './types';
import {
  clampColumnWidth,
  getCellClassname,
  getCellStyle,
  getHeaderCellRowSpan,
  getHeaderCellStyle,
  isCtrlKeyHeldDown,
  stopPropagation,
} from './utils/grid-utils';

const resizeHandleClassname =
  'cursor-col-resize absolute inset-y-0 end-0 w-4 after:content-[""] after:absolute after:top-1/2 after:-translate-y-1/2 after:end-0 after:h-4 after:w-0.5 after:rounded-full after:bg-foreground/30 hover:after:bg-primary/80';

const draggableColumnType = 'grid-column';
type ColumnDragData = { type: typeof draggableColumnType; columnKey: string };

function isColumnDragData(data: Record<string, unknown>): data is ColumnDragData {
  return data.type === draggableColumnType;
}

interface HeaderCellProps<R, SR> {
  sortColumns?: Maybe<readonly SortColumn[]>;
  onSortColumnsChange?: Maybe<(sortColumns: SortColumn[]) => void>;
  selectCell: (position: Position) => void;
  onColumnResize: (column: CalculatedColumn<R, SR>, width: ResizedWidth) => void;
  onColumnResizeEnd: () => void;
  shouldFocusGrid: boolean;
  isCellSelectionEnabled: boolean;
  onColumnsReorder?: Maybe<(sourceColumnKey: string, targetColumnKey: string) => void>;
  column: CalculatedColumn<R, SR>;
  colSpan: number | undefined;
  rowIdx: number;
  isCellSelected: boolean;
}

export function HeaderCell<R, SR>({
  column,
  colSpan,
  rowIdx,
  isCellSelected,
  isCellSelectionEnabled,
  onColumnResize,
  onColumnResizeEnd,
  onColumnsReorder,
  sortColumns,
  onSortColumnsChange,
  selectCell,
  shouldFocusGrid,
}: HeaderCellProps<R, SR>) {
  const cellRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [preview, setPreview] = useState<{ container: HTMLElement } | null>(null);
  const rowSpan = getHeaderCellRowSpan(column, rowIdx);
  // set the tabIndex to 0 when there is no selected cell so grid can receive focus
  const roving = useRovingTabIndex(shouldFocusGrid || isCellSelected);
  // When cell selection is disabled, every header cell stays in the natural tab order
  // so sortable headers remain reachable by keyboard.
  const tabIndex = isCellSelectionEnabled ? roving.tabIndex : 0;
  const childTabIndex = isCellSelectionEnabled ? roving.childTabIndex : 0;
  const onFocus = isCellSelectionEnabled ? roving.onFocus : undefined;
  const sortIndex = sortColumns?.findIndex((sort) => sort.columnKey === column.key);
  const sortColumn = sortIndex !== undefined && sortIndex > -1 ? sortColumns![sortIndex] : undefined;
  const sortDirection = sortColumn?.direction;
  const priority = sortColumn !== undefined && sortColumns!.length > 1 ? sortIndex! + 1 : undefined;
  const ariaSort = sortDirection && !priority ? (sortDirection === 'ASC' ? 'ascending' : 'descending') : undefined;
  const { sortable, resizable, draggable } = column;

  const className = getCellClassname(
    column,
    'border-t-0',
    column.headerCellClass,
    {
      'cursor-pointer': sortable,
      'touch-action-none': resizable,
      'opacity-40': isDragging,
      'z-3': column.frozen,
    },
    // When cell selection is disabled, header cells stay in the natural tab order;
    // render the focus affordance via :focus-visible since aria-selected is never true.
    !isCellSelectionEnabled &&
      'focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-solid focus-visible:-outline-offset-2',
  );

  // Pragmatic DnD for column reordering
  useEffect(() => {
    const el = cellRef.current;
    if (!el || !draggable || !onColumnsReorder) return;

    return combine(
      makeDraggable({
        element: el,
        getInitialData: (): ColumnDragData => ({ type: draggableColumnType, columnKey: column.key }),
        onGenerateDragPreview: ({ nativeSetDragImage }) => {
          setCustomNativeDragPreview({
            nativeSetDragImage,
            getOffset: () => ({ x: 16, y: 16 }),
            render: ({ container }) => setPreview({ container }),
          });
        },
        onDragStart: () => setIsDragging(true),
        onDrop: () => {
          setIsDragging(false);
          setPreview(null);
        },
      }),
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) => isColumnDragData(source.data) && source.data.columnKey !== column.key,
        getData: ({ input }) =>
          attachClosestEdge({ type: draggableColumnType, columnKey: column.key } satisfies ColumnDragData, {
            element: el,
            input,
            allowedEdges: ['left', 'right'],
          }),
        onDrag: ({ self }) => setClosestEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setClosestEdge(null),
        onDrop: ({ source }) => {
          setClosestEdge(null);
          if (isColumnDragData(source.data)) {
            onColumnsReorder(source.data.columnKey, column.key);
          }
        },
      }),
    );
  }, [column.key, draggable, onColumnsReorder]);

  function onSort(ctrlClick: boolean) {
    if (onSortColumnsChange == null) return;
    const { sortDescendingFirst } = column;
    if (sortColumn === undefined) {
      // not currently sorted
      const nextSort: SortColumn = {
        columnKey: column.key,
        direction: sortDescendingFirst ? 'DESC' : 'ASC',
      };
      onSortColumnsChange(sortColumns && ctrlClick ? [...sortColumns, nextSort] : [nextSort]);
    } else {
      let nextSortColumn: SortColumn | undefined;
      if (
        (sortDescendingFirst === true && sortDirection === 'DESC') ||
        (sortDescendingFirst !== true && sortDirection === 'ASC')
      ) {
        nextSortColumn = {
          columnKey: column.key,
          direction: sortDirection === 'ASC' ? 'DESC' : 'ASC',
        };
      }
      if (ctrlClick) {
        const nextSortColumns = [...sortColumns!];
        if (nextSortColumn) {
          // swap direction
          nextSortColumns[sortIndex!] = nextSortColumn;
        } else {
          // remove sort
          nextSortColumns.splice(sortIndex!, 1);
        }
        onSortColumnsChange(nextSortColumns);
      } else {
        onSortColumnsChange(nextSortColumn ? [nextSortColumn] : []);
      }
    }
  }

  function handleFocus(event: React.FocusEvent<HTMLDivElement>) {
    onFocus?.(event);
    if (shouldFocusGrid) {
      // Select the first header cell if there is no selected cell
      selectCell({ idx: 0, rowIdx });
    }
  }

  function onMouseDown() {
    selectCell({ idx: column.idx, rowIdx });
  }

  function onClick(event: React.MouseEvent<HTMLSpanElement>) {
    if (sortable) {
      onSort(event.ctrlKey || event.metaKey);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLSpanElement>) {
    const { key } = event;
    if (sortable && (key === ' ' || key === 'Enter')) {
      // prevent scrolling
      event.preventDefault();
      onSort(event.ctrlKey || event.metaKey);
    } else if (resizable && isCtrlKeyHeldDown(event) && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      // stopPropagation prevents grid navigation during column resize
      event.stopPropagation();
      const { width } = event.currentTarget.getBoundingClientRect();
      const offset = key === 'ArrowLeft' ? -10 : 10;
      const newWidth = clampColumnWidth(width + offset, column);
      if (newWidth !== width) {
        onColumnResize(column, newWidth);
      }
    }
  }

  const style: React.CSSProperties = {
    ...getHeaderCellStyle(column, rowIdx, rowSpan),
    ...getCellStyle(column, colSpan),
  };

  const content = column.renderHeaderCell({
    column,
    sortDirection,
    priority,
    tabIndex: childTabIndex,
  });

  return (
    <>
      <div
        ref={cellRef}
        role="columnheader"
        aria-colindex={column.idx + 1}
        aria-colspan={colSpan}
        aria-rowspan={rowSpan}
        aria-selected={isCellSelected}
        aria-sort={ariaSort}
        tabIndex={tabIndex}
        className={className}
        style={style}
        onMouseDown={onMouseDown}
        onFocus={handleFocus}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        {content}

        {resizable && (
          <ResizeHandle column={column} onColumnResize={onColumnResize} onColumnResizeEnd={onColumnResizeEnd} />
        )}
      </div>
      {closestEdge && <DropIndicator edge={closestEdge} gap={0} />}
      {preview &&
        createPortal(
          <div className="rounded border bg-background px-3 py-1.5 text-sm shadow-lg">{column.name}</div>,
          preview.container,
        )}
    </>
  );
}

type ResizeHandleProps<R, SR> = Pick<HeaderCellProps<R, SR>, 'column' | 'onColumnResize' | 'onColumnResizeEnd'>;

function ResizeHandle<R, SR>({ column, onColumnResize, onColumnResizeEnd }: ResizeHandleProps<R, SR>) {
  const resizingOffsetRef = useRef<number>(undefined);
  const initialLeftRef = useRef<number>(undefined);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.buttons !== 1) {
      return;
    }

    // Fix column resizing on a draggable column in FF
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
    if (width > 0 && newWidth !== width) {
      onColumnResize(column, newWidth);
    }
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
      className={resizeHandleClassname}
      onClick={stopPropagation}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      // we are not using pointerup because it does not fire in some cases
      // pointer down -> alt+tab -> pointer up over another window -> pointerup event not fired
      onLostPointerCapture={onLostPointerCapture}
      onDoubleClick={onDoubleClick}
    />
  );
}
