import { PencilIcon } from 'lucide-react';
import { type MouseEvent, memo } from 'react';
import { useRovingTabIndex } from './hooks';
import type { CalculatedColumn, CellMouseEventHandler, CellRendererProps, MergedSlots, TileSide } from './types';
import { cn, createCellEvent, getCellClassname, getCellStyle, isCellEditableUtil } from './utils/grid-utils';

const cellInRangeClassname = 'rdg-cell-in-range bg-primary/10 aria-selected:outline-none';
const cellRangeTopClassname = 'rdg-cell-range-top border-t-2 border-t-primary';
const cellRangeBottomClassname = 'rdg-cell-range-bottom border-b-2 border-b-primary';
const cellRangeLeftClassname = 'rdg-cell-range-left border-l-2 border-l-primary';
const cellRangeRightClassname = 'rdg-cell-range-right border-r-2 border-r-primary';

function Cell<R, SR>({
  column,
  colSpan,
  isCellSelected,
  isInSelectedRange,
  rangeBoundary,
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
  isCellSelectionEnabled,
  ...props
}: CellRendererProps<R, SR>) {
  const roving = useRovingTabIndex(isCellSelected);
  // When cell selection is disabled, the gridcell wrapper is not a tab stop and any
  // interactive children stay reachable via natural DOM tab order. Otherwise use the
  // standard roving-tabindex pattern.
  const tabIndex = isCellSelectionEnabled ? roving.tabIndex : -1;
  const childTabIndex = isCellSelectionEnabled ? roving.childTabIndex : 0;
  const onFocus = isCellSelectionEnabled ? roving.onFocus : undefined;

  const { cellClass } = column;

  const isEditable = isCellEditableUtil(column, row);
  // Editable cells get an explicit cursor so the hover affordance matches the
  // editor: an I-beam for free-text inputs, a pointer for editors that open a
  // picker (select/popover/drawer). Without this, every editable cell inherits
  // the browser's text I-beam from its selectable content — misleading for
  // non-text editors.
  const editorCursor = isEditable
    ? column.editorOptions?.editorType === 'select'
      ? 'cursor-pointer'
      : 'cursor-text'
    : undefined;

  className = getCellClassname(
    column,
    {
      [cellInRangeClassname]: isInSelectedRange === true,
      [cellRangeTopClassname]: isInSelectedRange === true && (rangeBoundary?.isTop ?? false),
      [cellRangeBottomClassname]: isInSelectedRange === true && (rangeBoundary?.isBottom ?? false),
      [cellRangeLeftClassname]: isInSelectedRange === true && (rangeBoundary?.isLeft ?? false),
      [cellRangeRightClassname]: isInSelectedRange === true && (rangeBoundary?.isRight ?? false),
    },
    // When cell selection is disabled, render the focus affordance via :focus-visible on
    // any interactive child (Button cell variant, links). Using has-[:focus-visible]
    // (instead of :focus-within) avoids showing the outline on mouse clicks.
    !isCellSelectionEnabled &&
      'has-focus-visible:outline-2 has-focus-visible:outline-primary has-focus-visible:outline-solid has-focus-visible:-outline-offset-2',
    editorCursor,
    typeof cellClass === 'function' ? cellClass(row) : cellClass,
    className,
  );

  // Non-focusable columns get tabIndex -1
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
    // Suppress the browser's native focus-on-mousedown scroll. The cell is
    // `tabIndex`'d for roving-tabindex keyboard nav and also has `scroll-mt-32`
    // (so keyboard navigation keeps the focused cell out from under the page's
    // sticky header). Together these cause a visible "page jumps after first
    // click" when clicking a cell near the top edge of the viewport — the UA
    // honors scroll-margin-top during the implicit focus scroll.
    //
    // Focus the cell ourselves *synchronously* with `preventScroll: true`. The
    // browser's implicit focus then sees an already-focused element and becomes
    // a no-op (no scroll). We deliberately do NOT call `event.preventDefault()`
    // here: that would also cancel the subsequent `dragstart` event and break
    // any pragmatic-dnd row-drag wiring on the cell.
    event.currentTarget.focus({ preventScroll: true });
    onMouseDown?.(event);
    if (!handleMouseEvent(event, onCellMouseDown)) {
      // select cell if the event is not prevented
      selectCell({ rowIdx, idx: column.idx }, { extendSelection: event.shiftKey });
    }
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    onClick?.(event);
    handleMouseEvent(event, onCellClick);
  }

  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    onDoubleClick?.(event);
    if (!handleMouseEvent(event, onCellDoubleClick)) {
      // go into edit mode if the event is not prevented
      selectCellWrapper(true);
    }
  }

  function handleContextMenu(event: MouseEvent<HTMLDivElement>) {
    onContextMenu?.(event);
    handleMouseEvent(event, onCellContextMenu);
  }

  function handleRowChange(newRow: R) {
    onRowChange(column, newRow);
  }

  return (
    <div
      role="gridcell"
      aria-colindex={column.idx + 1} // aria-colindex is 1-based
      aria-colspan={colSpan}
      aria-selected={isCellSelected || isInSelectedRange}
      aria-readonly={!isEditable || undefined}
      tabIndex={effectiveTabIndex}
      className={className}
      style={{
        ...getCellStyle(column, colSpan),
        ...style,
      }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onFocus={onFocus}
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
  onRowChange: (column: CalculatedColumn<R, SR>, newRow: R) => void;
}

/**
 * Host-cell content when other columns are merged into this column (`modes.*.merge`).
 * Layout: top slot row, then left slots | main content | right slots, then bottom slot row.
 * Slot wrappers carry `data-is-compact` so columns reuse their existing
 * `in-data-[is-compact=true]:hidden` classes for icon-only rendering, and
 * `data-tile-slot="<side>"` as a styling hook. Empty slots collapse entirely;
 * `placeholderValue` is suppressed inside slots (a cell full of `-` is noise).
 */
function MergedCellContent<R, SR>({
  column,
  slots,
  row,
  rowIdx,
  isCellEditable,
  tabIndex,
  onRowChange,
}: MergedCellContentProps<R, SR>) {
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
        onRowChange: (newRow: R) => onRowChange(slotColumn, newRow),
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
      <div
        data-tile-slot={side}
        data-is-compact="true"
        className={cn('flex min-w-0 items-center gap-2', sideClassName)}
      >
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
            onRowChange: (newRow: R) => onRowChange(column, newRow),
          })}
        </div>
        {renderSide('right', 'shrink-0')}
      </div>
      {renderSide('bottom', '')}
    </div>
  );
}

/** Renders cell content, falling back to placeholderValue when renderCell returns nullish */
function renderCellContent<R, SR>(
  column: CellRendererProps<R, SR>['column'],
  props: Parameters<typeof column.renderCell>[0],
) {
  const content = column.renderCell(props);
  if (content == null && column.placeholderValue != null) {
    return <span className="text-muted-foreground/50">{column.placeholderValue}</span>;
  }
  return content;
}

export const CellComponent = memo(Cell) as <R, SR>(props: CellRendererProps<R, SR>) => React.JSX.Element;
export function defaultRenderCell<R, SR>(key: React.Key, props: CellRendererProps<R, SR>) {
  return <CellComponent key={key} {...props} />;
}
