import { PencilIcon } from 'lucide-react';
import { type FocusEvent, type KeyboardEvent, type MouseEvent, memo } from 'react';
import { useRovingTabIndex } from './hooks';
import type { CalculatedColumn, CellMouseEventHandler, CellRendererProps, MergedSlots, TileSide } from './types';
import { cn, createCellEvent, getCellClassname, getCellStyle, isCellEditableUtil } from './utils/grid-utils';

function Cell<R, SR>({
  column,
  colSpan,
  isCellSelected,
  isDraggedOver,
  row,
  rowIdx,
  className,
  onMouseDown,
  onCellMouseDown,
  onClick,
  onCellClick,
  onDoubleClick,
  onCellDoubleClick,
  onContextMenu,
  onCellContextMenu,
  onRowChange,
  selectCell,
  style,
  ...props
}: CellRendererProps<R, SR>) {
  const { tabIndex, childTabIndex, onFocus } = useRovingTabIndex(isCellSelected);

  const { cellClass } = column;

  const isEditable = isCellEditableUtil(column, row);
  // Explicit cursor so the hover affordance matches the editor: I-beam for free text, pointer for pickers.
  const editorCursor = isEditable ? (column.editorOptions?.editorType === 'select' ? 'cursor-pointer' : 'cursor-text') : undefined;

  className = getCellClassname(column, editorCursor, typeof cellClass === 'function' ? cellClass(row) : cellClass, className);

  const effectiveTabIndex = column.focusable === false ? -1 : tabIndex;

  function selectCellWrapper(enableEditor?: boolean) {
    selectCell({ rowIdx, idx: column.idx }, { enableEditor });
  }

  function handleMouseEvent(event: React.MouseEvent<HTMLDivElement>, eventHandler?: CellMouseEventHandler<R, SR>) {
    let eventHandled = false;
    if (eventHandler) {
      const cellEvent = createCellEvent(event);
      eventHandler({ rowIdx, row, column, selectCell: selectCellWrapper }, cellEvent);
      eventHandled = cellEvent.isGridDefaultPrevented();
    }
    return eventHandled;
  }

  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    // Focus without scrolling so the cell's scroll margin cannot jump the page; the mousedown default must stay for row drag.
    event.currentTarget.focus({ preventScroll: true });
    // Script focus matches :focus-visible in Chromium even from a click, so the ring's selector excludes this marker.
    event.currentTarget.setAttribute('data-pointer-focus', '');
    onMouseDown?.(event);
    if (!handleMouseEvent(event, onCellMouseDown)) {
      selectCell({ rowIdx, idx: column.idx });
    }
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    onClick?.(event);
    handleMouseEvent(event, onCellClick);
  }

  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    onDoubleClick?.(event);
    if (!handleMouseEvent(event, onCellDoubleClick)) {
      selectCellWrapper(true);
    }
  }

  function handleContextMenu(event: MouseEvent<HTMLDivElement>) {
    onContextMenu?.(event);
    handleMouseEvent(event, onCellContextMenu);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute('data-pointer-focus');
  }

  function handleKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
    event.currentTarget.removeAttribute('data-pointer-focus');
  }

  function handleRowChange(newRow: R) {
    onRowChange(column, rowIdx, newRow);
  }

  return (
    <div
      role="gridcell"
      aria-colindex={column.idx + 1} // aria-colindex is 1-based
      aria-colspan={colSpan}
      aria-selected={isCellSelected}
      aria-readonly={!isEditable || undefined}
      tabIndex={effectiveTabIndex}
      className={className}
      style={{ ...getCellStyle(column, colSpan), ...style }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onFocus={onFocus}
      onBlur={handleBlur}
      onKeyDownCapture={handleKeyDownCapture}
      {...props}
    >
      {column.mergedSlots != null ? (
        <MergedCellContent
          column={column}
          slots={column.mergedSlots}
          row={row}
          rowIdx={rowIdx}
          isCellEditable={isEditable}
          tabIndex={childTabIndex}
          onRowChange={onRowChange}
        />
      ) : (
        renderCellContent(column, {
          column,
          row,
          rowIdx,
          isCellEditable: isEditable,
          tabIndex: childTabIndex,
          onRowChange: handleRowChange,
        })
      )}
      {isEditable && (
        <PencilIcon className="pointer-events-none absolute top-2 right-2 hidden size-3 text-muted-foreground sm:group-hover/cell:block" />
      )}
    </div>
  );
}

interface MergedCellContentProps<R, SR> {
  column: CalculatedColumn<R, SR>;
  slots: MergedSlots<R, SR>;
  row: R;
  rowIdx: number;
  isCellEditable: boolean;
  tabIndex: number;
  onRowChange: (column: CalculatedColumn<R, SR>, rowIdx: number, newRow: R) => void;
}

/** Empty slots collapse and render no placeholder. */
function MergedCellContent<R, SR>({ column, slots, row, rowIdx, isCellEditable, tabIndex, onRowChange }: MergedCellContentProps<R, SR>) {
  function renderSide(side: TileSide, sideClassName: string) {
    const sideSlots = slots[side];
    if (sideSlots.length === 0) return null;

    const children = sideSlots.map(({ column: slotColumn, className }) => {
      const content = slotColumn.renderCell({
        column: slotColumn,
        row,
        rowIdx,
        isCellEditable: false,
        tabIndex,
        onRowChange: (newRow: R) => onRowChange(slotColumn, rowIdx, newRow),
      });
      if (content == null) return null;
      return (
        <span key={slotColumn.key} className={cn('inline-flex min-w-0 shrink-0 items-center', className)}>
          {content}
        </span>
      );
    });
    if (children.every((child) => child === null)) return null;

    return (
      <div data-tile-slot={side} data-is-compact="true" className={cn('flex min-w-0 items-center gap-2', sideClassName)}>
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 grow flex-col justify-center gap-0.5">
      {renderSide('top', '')}
      <div className="flex min-w-0 items-center gap-2">
        {renderSide('left', 'shrink-0')}
        <div data-tile-main className="min-w-0 flex-1">
          {renderCellContent(column, {
            column,
            row,
            rowIdx,
            isCellEditable,
            tabIndex,
            onRowChange: (newRow: R) => onRowChange(column, rowIdx, newRow),
          })}
        </div>
        {renderSide('right', 'shrink-0')}
      </div>
      {renderSide('bottom', '')}
    </div>
  );
}

/** Renders cell content, falling back to placeholderValue when renderCell returns nullish */
function renderCellContent<R, SR>(column: CellRendererProps<R, SR>['column'], props: Parameters<typeof column.renderCell>[0]) {
  const content = column.renderCell(props);
  if (content == null && column.placeholderValue != null) {
    return <span className="text-faint-foreground">{column.placeholderValue}</span>;
  }
  return content;
}

export const CellComponent = memo(Cell) as <R, SR>(props: CellRendererProps<R, SR>) => React.JSX.Element;
export function defaultRenderCell<R, SR>(key: React.Key, props: CellRendererProps<R, SR>) {
  return <CellComponent key={key} {...props} />;
}
