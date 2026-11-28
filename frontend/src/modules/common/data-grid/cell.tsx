import { PencilIcon } from 'lucide-react';
import { type MouseEvent, memo } from 'react';
import { useRovingTabIndex } from './hooks';
import type { CalculatedColumn, CellRendererProps, MergedSlots, TileSide } from './types';
import { bodyCellFocusRing, cn, createCellEvent, getCellClassname, getCellStyle, isCellEditableUtil } from './utils/grid-utils';

function Cell<R, SR>({
  column,
  isCellSelected,
  isDraggedOver,
  row,
  rowIdx,
  className,
  onMouseDown,
  onClick,
  onCellClick,
  onDoubleClick,
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

  className = getCellClassname(column, bodyCellFocusRing, editorCursor, typeof cellClass === 'function' ? cellClass(row) : cellClass, className);

  const effectiveTabIndex = column.focusable === false ? -1 : tabIndex;

  function selectCellWrapper(enableEditor?: boolean) {
    selectCell({ rowIdx, idx: column.idx }, { enableEditor });
  }

  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    // Focus without scrolling so the cell's scroll margin cannot jump the page; the mousedown default must stay for row drag.
    event.currentTarget.focus({ preventScroll: true });
    onMouseDown?.(event);
    selectCell({ rowIdx, idx: column.idx });
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    onClick?.(event);
    onCellClick?.({ rowIdx, row, column, selectCell: selectCellWrapper }, createCellEvent(event));
  }

  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    onDoubleClick?.(event);
    selectCellWrapper(true);
  }

  function handleRowChange(newRow: R) {
    onRowChange(column, rowIdx, newRow);
  }

  return (
    <div
      role="gridcell"
      aria-colindex={column.idx + 1} // aria-colindex is 1-based
      aria-selected={isCellSelected}
      aria-readonly={!isEditable || undefined}
      tabIndex={effectiveTabIndex}
      className={className}
      style={{ ...getCellStyle(column), ...style }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onFocus={onFocus}
      {...props}
    >
      {column.mergedSlots != null ? (
        <MergedCellContent
          {...{ column, row, rowIdx, onRowChange }}
          slots={column.mergedSlots}
          isCellEditable={isEditable}
          tabIndex={childTabIndex}
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
        <PencilIcon className="text-muted-foreground pointer-events-none absolute top-2 right-2 hidden size-3 sm:group-hover/cell:block" />
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

    const children = sideSlots.map(({ column: slotColumn, className, width }) => {
      const content = slotColumn.renderCell({
        column: slotColumn,
        row,
        rowIdx,
        isCellEditable: false,
        tabIndex,
        onRowChange: (newRow: R) => onRowChange(slotColumn, rowIdx, newRow),
      });
      // A fixed width holds its place in a row without content, keeping the host's content in line with its header
      if (content == null && width == null) return null;
      return (
        <span
          key={slotColumn.key}
          style={width != null ? { width } : undefined}
          className={cn('inline-flex min-w-0 shrink-0 items-center', className)}
        >
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
export const defaultRenderCell = <R, SR>(key: React.Key, props: CellRendererProps<R, SR>) => <CellComponent key={key} {...props} />;
