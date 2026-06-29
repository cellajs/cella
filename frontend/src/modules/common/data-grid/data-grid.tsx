import type { Key, KeyboardEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useCurrentBreakpoint } from '~/hooks/use-breakpoints';
import { useLatestCallback } from '~/hooks/use-latest-ref';
import { defaultRenderCell } from './cell';
import { EditCell } from './edit-cell';
import { GroupedColumnHeaderRow } from './grouped-column-header-row';
import { HeaderRow } from './header-row';
import {
  HeaderRowSelectionChangeContext,
  HeaderRowSelectionContext,
  type HeaderRowSelectionContextValue,
  RowSelectionChangeContext,
  useCalculatedColumns,
  useColumnWidths,
  useDragAutoScroll,
  useGridDimensions,
  useInfiniteScroll,
  useViewportRows,
} from './hooks';
import type { RowsEndApproachingArgs } from './hooks/use-infinite-scroll';
import { useStickyHeader } from './hooks/use-sticky-header';
import { defaultRenderRow } from './row';
import { RowDragCell, type RowDragConfig } from './row-drag-cell';
import type {
  CalculatedColumn,
  CellClipboardEvent,
  CellCopyArgs,
  CellKeyboardEvent,
  CellKeyDownArgs,
  CellMouseEventHandler,
  CellNavigationMode,
  CellPasteArgs,
  CellRange,
  CellRendererProps,
  CellSelectArgs,
  CellSelectionMode,
  ColumnOrColumnGroup,
  ColumnWidths,
  DefaultColumnOptions,
  Maybe,
  Position,
  Renderers,
  RowSelectionMode,
  RowsChangeData,
  SelectCellOptions,
  SelectedCellRangeChangeArgs,
  SelectHeaderRowEvent,
  SelectRowEvent,
  SortColumn,
} from './types';
import {
  assertIsValidKeyGetter,
  canExitGrid,
  cellValueToText,
  cn,
  computeWrapTextRowHeight,
  createCellEvent,
  createRange,
  getColSpan,
  getLeftRightKey,
  getNextSelectedCellPosition,
  hasWrapTextColumns,
  isCtrlKeyHeldDown,
  isDefaultCellInput,
  isSelectedCellEditable,
  normalizeCellRange,
  renderMeasuringCells,
  scrollIntoView,
  serializeCellsToHTML,
  serializeCellsToTSV,
  sign,
} from './utils/grid-utils';

interface SelectCellState extends Position {
  readonly mode: 'SELECT';
}

interface EditCellState<R> extends Position {
  readonly mode: 'EDIT';
  readonly row: R;
  readonly originalRow: R;
}

export type { RowsEndApproachingArgs };

type SharedDivProps = Pick<
  React.ComponentProps<'div'>,
  'role' | 'aria-label' | 'aria-labelledby' | 'aria-description' | 'aria-describedby' | 'aria-rowcount' | 'className'
>;

export interface DataGridProps<R, SR = unknown, K extends Key = Key> extends SharedDivProps {
  /**
   * Grid and data Props
   */
  /** An array of column definitions */
  columns: readonly ColumnOrColumnGroup<NoInfer<R>, NoInfer<SR>>[];
  /** A function called for each rendered row that should return a plain key/value pair object */
  rows: readonly R[];
  /** Function to return a unique key/identifier for each row */
  rowKeyGetter?: Maybe<(row: NoInfer<R>) => K>;
  /** Callback triggered when rows are changed */
  onRowsChange?: Maybe<(rows: NoInfer<R>[], data: RowsChangeData<NoInfer<R>, NoInfer<SR>>) => void>;

  /**
   * Dimensions props
   */
  /**
   * Height of each row in pixels
   * @default 35
   */
  rowHeight?: Maybe<number | ((row: NoInfer<R>) => number)>;
  /**
   * Height of the header row in pixels
   * @default 35
   */
  headerRowHeight?: Maybe<number>;
  /** A map of column widths */
  columnWidths?: Maybe<ColumnWidths>;
  /** Callback triggered when column widths change */
  onColumnWidthsChange?: Maybe<(columnWidths: ColumnWidths) => void>;

  /**
   * Feature props
   */
  /** A set of selected row keys */
  selectedRows?: Maybe<ReadonlySet<K>>;
  /** Function to determine if row selection is disabled for a specific row */
  isRowSelectionDisabled?: Maybe<(row: NoInfer<R>) => boolean>;
  /** Callback triggered when the selection changes */
  onSelectedRowsChange?: Maybe<(selectedRows: Set<NoInfer<K>>) => void>;
  /** An array of sorted columns */
  sortColumns?: Maybe<readonly SortColumn[]>;
  /** Callback triggered when sorting changes */
  onSortColumnsChange?: Maybe<(sortColumns: SortColumn[]) => void>;
  /** Default options applied to all columns */
  defaultColumnOptions?: Maybe<DefaultColumnOptions<NoInfer<R>, NoInfer<SR>>>;

  /**
   * Event props
   */
  /** Callback triggered when a pointer becomes active in a cell */
  onCellMouseDown?: CellMouseEventHandler<R, SR>;
  /** Callback triggered when a cell is clicked */
  onCellClick?: CellMouseEventHandler<R, SR>;
  /** Callback triggered when a cell is double-clicked */
  onCellDoubleClick?: CellMouseEventHandler<R, SR>;
  /** Callback triggered when a cell is right-clicked */
  onCellContextMenu?: CellMouseEventHandler<R, SR>;
  /** Callback triggered when a key is pressed in a cell */
  onCellKeyDown?: Maybe<(args: CellKeyDownArgs<NoInfer<R>, NoInfer<SR>>, event: CellKeyboardEvent) => void>;
  /** Callback triggered when a cell's content is copied */
  onCellCopy?: Maybe<(args: CellCopyArgs<NoInfer<R>, NoInfer<SR>>, event: CellClipboardEvent) => void>;
  /** Callback triggered when content is pasted into a cell */
  onCellPaste?: Maybe<(args: CellPasteArgs<NoInfer<R>, NoInfer<SR>>, event: CellClipboardEvent) => NoInfer<R>>;
  /** Function called whenever cell selection is changed */
  onSelectedCellChange?: Maybe<(args: CellSelectArgs<NoInfer<R>, NoInfer<SR>>) => void>;
  /** Callback triggered when the grid is scrolled */
  onScroll?: Maybe<(event: React.UIEvent<HTMLDivElement>) => void>;
  /** Callback triggered when column is resized */
  onColumnResize?: Maybe<(column: CalculatedColumn<R, SR>, width: number) => void>;
  /** Callback triggered when columns are reordered */
  onColumnsReorder?: Maybe<(sourceColumnKey: string, targetColumnKey: string) => void>;
  /**
   * Enable row drag-and-drop reordering. The cells of the column flagged
   * `rowDragHandle: true` become drag sources; every cell becomes a drop
   * target with top/bottom drop indicators.
   * Pair with `enableDragAutoScroll` for long, scrollable lists.
   */
  onRowReorder?: Maybe<(fromIdx: number, toIdx: number, edge: 'top' | 'bottom') => void>;
  /**
   * Optional: when provided, the middle 50% of each row becomes a "reparent"
   * drop zone. Use for tree-structured data (e.g. drop a row onto another to
   * make it a child).
   */
  onRowReparent?: Maybe<(fromIdx: number, toIdx: number) => void>;
  /**
   * Optional per-zone drop validation. Called on every drag move; must be fast.
   * If the cursor's natural zone is blocked but another zone is allowed, the
   * drop indicator falls back to the nearest allowed zone. If all three zones
   * are blocked, no indicator is shown and `onDrop` is suppressed.
   *
   * Use this for tree-structured constraints (max depth, cycle prevention)
   * without coupling the grid to your row shape.
   */
  canDropRow?: Maybe<(args: { fromIdx: number; toIdx: number; zone: 'top' | 'bottom' | 'center' }) => boolean>;
  /**
   * Optional content rendered inside the native drag preview while a row is
   * being dragged. Defaults to a generic preview.
   */
  renderRowDragPreview?: Maybe<(row: NoInfer<R>) => React.ReactNode>;

  /**
   * Toggles and modes
   */
  /** @default true */
  enableVirtualization?: Maybe<boolean>;
  /**
   * Enable row virtualization independently
   * When set, overrides enableVirtualization for rows
   */
  enableRowVirtualization?: Maybe<boolean>;
  /**
   * Pin header rows to the viewport top when the grid scrolls out of view.
   * Opt-in: most embedded/static tables don't want this.
   * @default false
   */
  enableStickyHeader?: Maybe<boolean>;
  /**
   * Enable vertical auto-scroll of the grid viewport during pragmatic-dnd drag operations.
   * Opt-in: only useful for tables that wire up row drag-and-drop.
   * @default false
   */
  enableDragAutoScroll?: Maybe<boolean>;
  /**
   * Cell selection mode (focus + range).
   * - 'none': no cell focus
   * - 'cell': single cell focus (default)
   * - 'cell-range': multi-cell range with Shift+Click/Arrow
   * @default 'cell'
   */
  cellSelectionMode?: Maybe<CellSelectionMode>;
  /**
   * Row selection mode for clicking the row body.
   * The checkbox column (if present) always operates as multi-select regardless of this prop.
   * - 'none': clicking a row body does not change row selection (default)
   * - 'single': clicking a row body selects only that row
   * - 'multi': clicking a row body toggles it; Shift+click extends a range
   * @default 'none'
   */
  rowSelectionMode?: Maybe<RowSelectionMode>;
  /**
   * Currently selected cell range (for 'cell-range' selection mode)
   * Use with onSelectedCellRangeChange for controlled selection
   */
  selectedCellRange?: Maybe<CellRange>;
  /**
   * Callback triggered when the selected cell range changes
   */
  onSelectedCellRangeChange?: Maybe<(args: SelectedCellRangeChangeArgs<NoInfer<R>, NoInfer<SR>>) => void>;

  /**
   * Infinite scroll support
   */
  /**
   * Callback triggered when the rendered rows approach the end of the dataset.
   * Useful for implementing infinite scroll / load more functionality.
   * Fires when rowOverscanEndIdx >= rows.length - rowsEndApproachingThreshold.
   * Only fires once per rows.length to prevent re-triggering after data loads.
   */
  onRowsEndApproaching?: Maybe<(args: RowsEndApproachingArgs) => void>;
  /**
   * Number of rows from the end at which onRowsEndApproaching fires.
   * @default Dynamic: 25% of rows, clamped between 10 and 50
   */
  rowsEndApproachingThreshold?: Maybe<number>;

  /**
   * Miscellaneous
   */
  /** Custom renderers for cells, rows, and other components */
  renderers?: Maybe<Renderers<NoInfer<R>, NoInfer<SR>>>;
  /** Function to apply custom class names to rows */
  rowClass?: Maybe<(row: NoInfer<R>, rowIdx: number) => Maybe<string>>;
  /** Custom class name for the header row */
  headerRowClass?: Maybe<string>;
  /**
   * Enable compact mode. When true, columns with a `compact` override use their compact widths,
   * and `data-is-compact="true"` is set on the grid root for CSS-based content hiding.
   * @default false
   */
  isCompact?: Maybe<boolean>;
  /** Hide the header row entirely */
  hideHeader?: Maybe<boolean>;
  /** Mark grid as read-only — suppresses selection outlines and edit affordances */
  readOnly?: Maybe<boolean>;
  'data-testid'?: Maybe<string>;
  'data-cy'?: Maybe<string>;
}

/**
 * Main API Component to render a data grid of rows and columns
 *
 * @example
 *
 * <DataGrid columns={columns} rows={rows} />
 */
export function DataGrid<R, SR = unknown, K extends Key = Key>(props: DataGridProps<R, SR, K>) {
  const {
    // Grid and data Props
    columns: rawColumns,
    rows,
    rowKeyGetter,
    onRowsChange,
    // Dimensions props
    rowHeight: rawRowHeight,
    headerRowHeight: rawHeaderRowHeight,
    columnWidths: columnWidthsRaw,
    onColumnWidthsChange: onColumnWidthsChangeRaw,
    // Feature props
    selectedRows,
    isRowSelectionDisabled,
    onSelectedRowsChange,
    sortColumns,
    onSortColumnsChange,
    defaultColumnOptions,
    // Event props
    onCellMouseDown,
    onCellClick,
    onCellDoubleClick,
    onCellContextMenu,
    onCellKeyDown,
    onSelectedCellChange,
    onScroll,
    onColumnResize,
    onColumnsReorder,
    onRowReorder,
    onRowReparent,
    canDropRow,
    renderRowDragPreview,
    onCellCopy,
    onCellPaste,
    // Toggles and modes
    enableVirtualization: rawEnableVirtualization,
    enableRowVirtualization: rawEnableRowVirtualization,
    enableStickyHeader: rawEnableStickyHeader,
    enableDragAutoScroll: rawEnableDragAutoScroll,
    cellSelectionMode: rawCellSelectionMode,
    rowSelectionMode: rawRowSelectionMode,
    selectedCellRange: selectedCellRangeProp,
    onSelectedCellRangeChange,
    // Infinite scroll
    onRowsEndApproaching,
    rowsEndApproachingThreshold: rawRowsEndApproachingThreshold,
    // Miscellaneous
    renderers,
    className,
    rowClass,
    headerRowClass,
    // ARIA
    role: rawRole,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-description': ariaDescription,
    'aria-describedby': ariaDescribedBy,
    'aria-rowcount': rawAriaRowCount,
    isCompact,
    hideHeader,
    readOnly,
    'data-testid': testId,
    'data-cy': dataCy,
  } = props;

  /**
   * defaults
   */
  const role = rawRole ?? 'grid';
  const baseRowHeight = rawRowHeight ?? 35;
  // When hideHeader is true, collapse the reserved header grid track to 0 so it doesn't leave empty space.
  const headerRowHeight = hideHeader
    ? 0
    : (rawHeaderRowHeight ?? (typeof baseRowHeight === 'number' ? baseRowHeight : 35));
  const renderRow = renderers?.renderRow ?? defaultRenderRow;
  const userRenderCell = renderers?.renderCell ?? defaultRenderCell;
  // Wrap the row-DnD callbacks in latest-refs so consumers can pass plain
  // (non-memoized) functions without invalidating `rowDragConfig` (and, by
  // extension, `renderCell` → every `Row.memo` → every `RowDragCell`) on each
  // parent render. The grid does the same for cell mouse handlers below.
  const onRowReorderLatest = useLatestCallback(onRowReorder ?? (() => {}));
  const onRowReparentLatest = useLatestCallback(onRowReparent ?? (() => {}));
  const canDropRowLatest = useLatestCallback(canDropRow ?? (() => true));
  const renderRowDragPreviewLatest = useLatestCallback(renderRowDragPreview ?? (() => null));
  // When row reorder is enabled, wrap the active renderCell with row-DnD
  // wiring. Identity is keyed only on whether features are enabled, so it
  // stays stable across renders even when consumer callbacks aren't memoized.
  const rowDragEnabled = onRowReorder != null;
  const reparentEnabled = onRowReparent != null;
  const canDropRowEnabled = canDropRow != null;
  const dragPreviewEnabled = renderRowDragPreview != null;
  const rowDragConfig = useMemo<RowDragConfig<R> | null>(
    () =>
      rowDragEnabled
        ? {
            onRowReorder: onRowReorderLatest,
            onRowReparent: reparentEnabled ? onRowReparentLatest : undefined,
            canDropRow: canDropRowEnabled ? canDropRowLatest : undefined,
            renderRowDragPreview: dragPreviewEnabled ? renderRowDragPreviewLatest : undefined,
          }
        : null,
    [
      rowDragEnabled,
      reparentEnabled,
      canDropRowEnabled,
      dragPreviewEnabled,
      onRowReorderLatest,
      onRowReparentLatest,
      canDropRowLatest,
      renderRowDragPreviewLatest,
    ],
  );
  const renderCell = useMemo(() => {
    if (!rowDragConfig) return userRenderCell;
    const config = rowDragConfig as RowDragConfig<unknown>;
    return (key: Key, props: Parameters<typeof userRenderCell>[1]) => (
      <RowDragCell key={key} {...(props as CellRendererProps<unknown, SR>)} config={config} />
    );
  }, [rowDragConfig, userRenderCell]);
  const noRowsFallback = renderers?.noRowsFallback;
  const enableVirtualization = rawEnableVirtualization ?? true;
  const enableRowVirtualization = rawEnableRowVirtualization ?? enableVirtualization;
  const enableStickyHeader = rawEnableStickyHeader ?? false;
  const enableDragAutoScroll = rawEnableDragAutoScroll ?? false;
  const cellSelectionMode: CellSelectionMode = rawCellSelectionMode ?? 'cell';
  const rowSelectionMode: RowSelectionMode = rawRowSelectionMode ?? 'none';
  const isCellSelectionEnabled = cellSelectionMode !== 'none';

  // Get current breakpoint for responsive features
  const currentBreakpoint = useCurrentBreakpoint();

  // Disable row selection on the smallest breakpoint (xs) where checkboxes are hidden
  const isMobileBreakpoint = currentBreakpoint === 'xs';
  const effectiveSelectedRows = isMobileBreakpoint ? undefined : selectedRows;
  const effectiveOnSelectedRowsChange = isMobileBreakpoint ? undefined : onSelectedRowsChange;

  /**
   * states
   */
  const [columnWidthsInternal, setColumnWidthsInternal] = useState((): ColumnWidths => columnWidthsRaw ?? new Map());
  const [isColumnResizing, setColumnResizing] = useState(false);
  const shouldFocusCellRef = useRef(false);
  // When true, the next focus effect should skip scrollIntoView. Set on EDIT→SELECT
  // close, where the cell hasn't moved — calling scrollIntoView there would honor
  // `scroll-mt-32` and visibly jump the page after the editor closes near the
  // viewport edge.
  const skipScrollOnFocusRef = useRef(false);
  const [previousRowIdx, setPreviousRowIdx] = useState(-1);
  const [selectedCellRangeInternal, setSelectedCellRangeInternal] = useState<CellRange | null>(null);
  const [cellRangeAnchor, setCellRangeAnchor] = useState<Position | null>(null);

  // Controlled vs uncontrolled cell range
  const isSelectedCellRangeControlled = selectedCellRangeProp !== undefined && onSelectedCellRangeChange != null;
  const selectedCellRange = isSelectedCellRangeControlled ? selectedCellRangeProp : selectedCellRangeInternal;
  const setSelectedCellRange = isSelectedCellRangeControlled
    ? (range: CellRange | null) => {
        onSelectedCellRangeChange({ range });
      }
    : setSelectedCellRangeInternal;

  const isColumnWidthsControlled = columnWidthsRaw != null && onColumnWidthsChangeRaw != null && !isColumnResizing;
  const columnWidths = isColumnWidthsControlled ? columnWidthsRaw : columnWidthsInternal;
  const onColumnWidthsChange = isColumnWidthsControlled
    ? (columnWidths: ColumnWidths) => {
        // we keep the internal state in sync with the prop but this prevents an extra render
        setColumnWidthsInternal(columnWidths);
        onColumnWidthsChangeRaw(columnWidths);
      }
    : setColumnWidthsInternal;

  const getColumnWidth = useCallback(
    (column: CalculatedColumn<R, SR>) => {
      return columnWidths.get(column.key)?.width ?? column.width;
    },
    [columnWidths],
  );

  const { gridRef, viewportHeight, horizontalScrollbarHeight, scrollTop } = useGridDimensions(
    undefined,
    enableRowVirtualization,
  );

  const {
    columns,
    colSpanColumns,
    lastFrozenColumnIndex,
    headerRowsCount,
    templateColumns,
    layoutCssVars,
    totalFrozenColumnWidth,
  } = useCalculatedColumns({
    rawColumns,
    defaultColumnOptions,
    getColumnWidth,
    currentBreakpoint,
    isCompact: isCompact ?? false,
  });

  // Pin header row(s) to viewport top when grid scrolls out of view
  useStickyHeader(gridRef, headerRowsCount, headerRowHeight, enableStickyHeader);

  // Auto-scroll the nearest vertically-scrollable ancestor (or the window)
  // while a pragmatic-dnd drag is in progress.
  useDragAutoScroll(gridRef, enableDragAutoScroll);

  // Compute effective rowHeight, wrapping baseRowHeight with wrapText-aware logic
  // when any column has wrapText enabled. This turns a fixed height into a per-row
  // function that accounts for multi-line content.
  const rowHeight = useMemo(() => {
    if (typeof baseRowHeight === 'function') return baseRowHeight;
    if (!hasWrapTextColumns(columns)) return baseRowHeight;
    return (row: R) => computeWrapTextRowHeight(baseRowHeight, columns as readonly CalculatedColumn<R, unknown>[], row);
  }, [baseRowHeight, columns]);

  const groupedColumnHeaderRowsCount = headerRowsCount - 1;
  const minRowIdx = -headerRowsCount;
  const mainHeaderRowIdx = minRowIdx + groupedColumnHeaderRowsCount;
  const maxRowIdx = rows.length - 1;

  const [selectedPosition, setSelectedPosition] = useState((): SelectCellState | EditCellState<R> => ({
    idx: -1,
    rowIdx: minRowIdx - 1,
    mode: 'SELECT',
  }));

  /**
   * refs
   */
  const focusSinkRef = useRef<HTMLDivElement>(null);
  // Guard to prevent double-commit when both commitEditorChanges (from selectCell)
  // and the EditCell's outside-click handler fire for the same edit session.
  const editCommittedRef = useRef(false);

  /**
   * computed values
   */
  const isTreeGrid = role === 'treegrid';
  const headerRowsHeight = headerRowsCount * headerRowHeight;
  const clientHeight = viewportHeight - headerRowsHeight;
  const isSelectable = effectiveSelectedRows != null && effectiveOnSelectedRowsChange != null;
  const { leftKey, rightKey } = getLeftRightKey();
  const ariaRowCount = rawAriaRowCount ?? headerRowsCount + rows.length;

  const headerSelectionValue = useMemo((): HeaderRowSelectionContextValue => {
    // Header "select all" only meaningful when row selection is provided
    if (!isSelectable) {
      return {
        isRowSelected: false,
        isIndeterminate: false,
      };
    }

    // no rows to select = explicitely unchecked
    let hasSelectedRow = false;
    let hasUnselectedRow = false;

    if (rowKeyGetter != null && effectiveSelectedRows != null && effectiveSelectedRows.size > 0) {
      for (const row of rows) {
        if (effectiveSelectedRows.has(rowKeyGetter(row))) {
          hasSelectedRow = true;
        } else {
          hasUnselectedRow = true;
        }

        if (hasSelectedRow && hasUnselectedRow) break;
      }
    }

    return {
      isRowSelected: hasSelectedRow && !hasUnselectedRow,
      isIndeterminate: hasSelectedRow && hasUnselectedRow,
    };
  }, [rows, effectiveSelectedRows, rowKeyGetter, isSelectable]);

  const {
    rowOverscanStartIdx,
    rowOverscanEndIdx,
    totalRowHeight,
    gridTemplateRows,
    getRowTop,
    getRowHeight,
    findRowIdx,
  } = useViewportRows({
    rows,
    rowHeight,
    clientHeight,
    scrollTop,
    enableVirtualization: enableRowVirtualization,
  });

  const {
    gridTemplateColumns,
    handleColumnResize,
    handleColumnResizeEnd: handleColumnResizeEndWidths,
  } = useColumnWidths(
    columns,
    templateColumns,
    gridRef,
    columnWidths,
    onColumnWidthsChange,
    onColumnResize,
    setColumnResizing,
  );

  const minColIdx = isTreeGrid ? -1 : 0;
  const maxColIdx = columns.length - 1;
  const selectedCellIsWithinSelectionBounds = isCellWithinSelectionBounds(selectedPosition);
  const selectedCellIsWithinViewportBounds = isCellWithinViewportBounds(selectedPosition);
  const scrollHeight = headerRowHeight + totalRowHeight + horizontalScrollbarHeight;

  function selectCell(position: Position, options?: SelectCellOptions): void {
    if (!isCellSelectionEnabled) return;
    if (!isCellWithinSelectionBounds(position)) return;
    commitEditorChanges();

    const samePosition = isSamePosition(selectedPosition, position);

    if (options?.enableEditor && isCellEditable(position)) {
      const row = rows[position.rowIdx];
      setSelectedPosition({ ...position, mode: 'EDIT', row, originalRow: row });
    } else if (samePosition) {
      // Avoid re-renders if the selected cell state is the same.
      // Only scroll into view when a caller explicitly asked for cell focus
      // (keyboard / programmatic paths). Mouse callers (Cell.handleMouseDown)
      // omit `shouldFocusCell` because the cell was just clicked — it is by
      // definition under the cursor, and our cells have `scroll-mt-32` for
      // sticky-header avoidance, which would otherwise jump the page on every
      // re-click of an already-selected cell near the viewport edge.
      if (options?.shouldFocusCell === true) {
        scrollIntoView(getCellToScroll(gridRef.current!));
      }
    } else {
      shouldFocusCellRef.current = options?.shouldFocusCell === true;
      setSelectedPosition({ ...position, mode: 'SELECT' });
    }

    if (onSelectedCellChange && !samePosition) {
      onSelectedCellChange({
        rowIdx: position.rowIdx,
        row: isRowIdxWithinViewportBounds(position.rowIdx) ? rows[position.rowIdx] : undefined,
        column: columns[position.idx],
      });
    }

    if (cellSelectionMode === 'cell-range') {
      const shouldExtendSelection = options?.extendSelection === true;
      const fallbackAnchor = isDataCellPosition(selectedPosition) ? selectedPosition : position;
      const anchor = shouldExtendSelection ? (cellRangeAnchor ?? fallbackAnchor) : position;

      if (isDataCellPosition(anchor) && isDataCellPosition(position)) {
        setSelectedCellRange(createRange(anchor, position));
        setCellRangeAnchor(anchor);
      } else {
        setSelectedCellRange(null);
        setCellRangeAnchor(null);
      }
    }

    // Bridge cell click to row selection when rowSelectionMode is enabled.
    // The checkbox column also bridges here so clicks that land on the cell
    // padding (around the checkbox) still toggle the row. The checkbox button
    // itself stops mousedown propagation to avoid a double-toggle race.
    if (rowSelectionMode !== 'none' && effectiveOnSelectedRowsChange && isDataCellPosition(position)) {
      const row = rows[position.rowIdx];
      if (row !== undefined && isRowSelectionDisabled?.(row) !== true) {
        assertIsValidKeyGetter<R, K>(rowKeyGetter);
        const rowKey = rowKeyGetter(row);
        if (rowSelectionMode === 'single') {
          // Replace selection with this single row
          const isOnlySelected = effectiveSelectedRows?.size === 1 && effectiveSelectedRows.has(rowKey);
          if (!isOnlySelected) {
            effectiveOnSelectedRowsChange(new Set([rowKey]));
          }
        } else {
          // 'multi' — toggle, with shift extending range
          const isShiftClick = options?.extendSelection === true;
          const isSelected = effectiveSelectedRows?.has(rowKey) === true;
          selectRow({ row, checked: !isSelected, isShiftClick });
        }
      }
    }
  }

  function selectHeaderCell({ idx, rowIdx }: Position): void {
    selectCell({ rowIdx: minRowIdx + rowIdx - 1, idx });
  }

  /**
   * The identity of the wrapper function is stable so it won't break memoization
   */
  const handleColumnResizeLatest = useLatestCallback(handleColumnResize);
  const handleColumnResizeEndLatest = useLatestCallback(handleColumnResizeEnd);
  const onColumnsReorderLastest = useLatestCallback(onColumnsReorder);
  const onSortColumnsChangeLatest = useLatestCallback(onSortColumnsChange);
  const onCellMouseDownLatest = useLatestCallback(onCellMouseDown);
  const onCellClickLatest = useLatestCallback(onCellClick);
  const onCellDoubleClickLatest = useLatestCallback(onCellDoubleClick);
  const onCellContextMenuLatest = useLatestCallback(onCellContextMenu);
  const selectHeaderRowLatest = useLatestCallback(selectHeaderRow);
  const selectRowLatest = useLatestCallback(selectRow);
  const handleFormatterRowChangeLatest = useLatestCallback(updateRow);
  const selectCellLatest = useLatestCallback(selectCell);
  const selectHeaderCellLatest = useLatestCallback(selectHeaderCell);

  const focusCell = useCallback(
    (shouldScroll = true) => {
      const cell = getCellToScroll(gridRef.current!);
      if (cell === null) return;

      if (shouldScroll) {
        scrollIntoView(cell);
      }

      cell.focus({ preventScroll: true });
    },
    [gridRef],
  );

  /**
   * effects
   */
  useLayoutEffect(() => {
    if (!shouldFocusCellRef.current) return;
    shouldFocusCellRef.current = false;
    const shouldScroll = !skipScrollOnFocusRef.current;
    skipScrollOnFocusRef.current = false;
    if (focusSinkRef.current !== null && selectedPosition.idx === -1) {
      focusSinkRef.current.focus({ preventScroll: true });
      if (shouldScroll) scrollIntoView(focusSinkRef.current);
    } else {
      focusCell(shouldScroll);
    }
    // `selectedPosition.mode` is included so EDIT → SELECT transitions on the
    // same cell (e.g. the dropdowner-based enum select editor closing) restore
    // focus to the cell. Without it, the deps would compare equal and no
    // focusCell() would run, leaving the grid unfocused after edit.
  }, [focusCell, selectedPosition.idx, selectedPosition.rowIdx, selectedPosition.mode]);

  useEffect(() => {
    if (!isCellSelectionEnabled) {
      setSelectedPosition((position) => {
        if (position.idx === -1 && position.rowIdx === minRowIdx - 1 && position.mode === 'SELECT') {
          return position;
        }

        return { idx: -1, rowIdx: minRowIdx - 1, mode: 'SELECT' };
      });
      if (isSelectedCellRangeControlled) {
        if (selectedCellRangeProp != null) {
          onSelectedCellRangeChange?.({ range: null });
        }
      } else if (selectedCellRangeInternal != null) {
        setSelectedCellRangeInternal(null);
      }

      if (cellRangeAnchor != null) {
        setCellRangeAnchor(null);
      }

      return;
    }

    if (cellSelectionMode !== 'cell-range') {
      if (isSelectedCellRangeControlled) {
        if (selectedCellRangeProp != null) {
          onSelectedCellRangeChange?.({ range: null });
        }
      } else if (selectedCellRangeInternal != null) {
        setSelectedCellRangeInternal(null);
      }

      if (cellRangeAnchor != null) {
        setCellRangeAnchor(null);
      }
    }
  }, [
    cellRangeAnchor,
    isCellSelectionEnabled,
    isSelectedCellRangeControlled,
    minRowIdx,
    onSelectedCellRangeChange,
    cellSelectionMode,
    selectedCellRangeInternal,
    selectedCellRangeProp,
  ]);

  // Reset the edit-committed guard when entering a new edit session.
  // Runs after render so the old EditCell has already unmounted and cancelled its outside-click handlers.
  useEffect(() => {
    if (selectedPosition.mode === 'EDIT') {
      editCommittedRef.current = false;
    }
  }, [selectedPosition.mode]);

  // Infinite scroll: fires onRowsEndApproaching when the rendered viewport
  // approaches the end of the dataset. Tracks lastFiredForRowsLength internally
  // to prevent re-triggering immediately after new data arrives.
  useInfiniteScroll({
    totalRows: rows.length,
    rowOverscanEndIdx,
    clientHeight,
    onRowsEndApproaching,
    threshold: rawRowsEndApproachingThreshold,
  });

  /**
   * event handlers
   */
  function selectHeaderRow(args: SelectHeaderRowEvent) {
    if (!effectiveOnSelectedRowsChange) return;

    assertIsValidKeyGetter<R, K>(rowKeyGetter);

    const newSelectedRows = new Set(effectiveSelectedRows);
    for (const row of rows) {
      if (isRowSelectionDisabled?.(row) === true) continue;
      const rowKey = rowKeyGetter(row);
      if (args.checked) {
        newSelectedRows.add(rowKey);
      } else {
        newSelectedRows.delete(rowKey);
      }
    }
    effectiveOnSelectedRowsChange(newSelectedRows);
  }

  function selectRow(args: SelectRowEvent<R>) {
    if (!effectiveOnSelectedRowsChange) return;

    assertIsValidKeyGetter<R, K>(rowKeyGetter);
    const { row, checked, isShiftClick } = args;
    if (isRowSelectionDisabled?.(row) === true) return;

    const newSelectedRows = new Set(effectiveSelectedRows);
    const rowKey = rowKeyGetter(row);
    const rowIdx = rows.indexOf(row);
    setPreviousRowIdx(rowIdx);

    if (checked) {
      newSelectedRows.add(rowKey);
    } else {
      newSelectedRows.delete(rowKey);
    }

    if (isShiftClick && previousRowIdx !== -1 && previousRowIdx !== rowIdx && previousRowIdx < rows.length) {
      const step = sign(rowIdx - previousRowIdx);
      for (let i = previousRowIdx + step; i !== rowIdx; i += step) {
        const row = rows[i];
        if (isRowSelectionDisabled?.(row) === true) continue;
        if (checked) {
          newSelectedRows.add(rowKeyGetter(row));
        } else {
          newSelectedRows.delete(rowKeyGetter(row));
        }
      }
    }

    effectiveOnSelectedRowsChange(newSelectedRows);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const { idx, rowIdx, mode } = selectedPosition;
    if (mode === 'EDIT') return;

    if (onCellKeyDown && isRowIdxWithinViewportBounds(rowIdx)) {
      const row = rows[rowIdx];
      const cellEvent = createCellEvent(event);
      onCellKeyDown(
        {
          mode: 'SELECT',
          row,
          column: columns[idx],
          rowIdx,
          selectCell,
        },
        cellEvent,
      );
      if (cellEvent.isGridDefaultPrevented()) return;
    }

    if (!(event.target instanceof Element)) return;
    const isCellEvent = event.target.closest('.rdg-cell') !== null;
    const isRowEvent = isTreeGrid && event.target === focusSinkRef.current;
    if (!isCellEvent && !isRowEvent) return;

    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'Tab':
      case 'Home':
      case 'End':
      case 'PageUp':
      case 'PageDown':
        navigate(event);
        break;
      default:
        handleCellInput(event);
        break;
    }
  }

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    // Toggle data attribute so CSS can scope frozen-column shadow to scrolled state
    el.toggleAttribute('data-scrolled-left', el.scrollLeft > 0);
    onScroll?.(event);
  }

  function updateRow(column: CalculatedColumn<R, SR>, rowIdx: number, row: R) {
    if (typeof onRowsChange !== 'function') return;
    if (row === rows[rowIdx]) return;
    const updatedRows = rows.with(rowIdx, row);
    onRowsChange(updatedRows, {
      indexes: [rowIdx],
      column,
    });
  }

  function commitEditorChanges() {
    if (selectedPosition.mode !== 'EDIT') return;
    if (editCommittedRef.current) return;
    editCommittedRef.current = true;
    updateRow(columns[selectedPosition.idx], selectedPosition.rowIdx, selectedPosition.row);
  }

  function handleCellCopy(event: CellClipboardEvent) {
    if (!selectedCellIsWithinViewportBounds) return;

    // Multi-cell range copy
    if (selectedCellRange) {
      const normalized = normalizeCellRange(selectedCellRange);
      const textValue = serializeCellsToTSV(normalized, rows, columns);
      const htmlValue = serializeCellsToHTML(normalized, rows, columns);
      event.clipboardData.setData('text/plain', textValue);
      event.clipboardData.setData('text/html', htmlValue);
      event.preventDefault();
      return;
    }

    // Single cell copy
    const { idx, rowIdx } = selectedPosition;
    const column = columns[idx];
    const row = rows[rowIdx];
    const value = row[column.key as keyof R];
    onCellCopy?.({ row, column, rowIdx, value }, event);

    // Write cell value to clipboard if the callback didn't already handle it
    if (!event.defaultPrevented) {
      event.clipboardData.setData('text/plain', cellValueToText(value));
      event.preventDefault();
    }
  }

  function handleCellPaste(event: CellClipboardEvent) {
    if (!onCellPaste || !onRowsChange || !isCellEditable(selectedPosition)) {
      return;
    }

    const { idx, rowIdx } = selectedPosition;
    const column = columns[idx];
    const pastedValue = event.clipboardData?.getData('text/plain') ?? '';
    const updatedRow = onCellPaste({ row: rows[rowIdx], column, rowIdx, pastedValue }, event);
    updateRow(column, rowIdx, updatedRow);
  }

  function handleCellInput(event: KeyboardEvent<HTMLDivElement>) {
    if (!selectedCellIsWithinViewportBounds) return;
    const row = rows[selectedPosition.rowIdx];
    const { key, shiftKey } = event;

    // Select the row on Shift + Space
    if (isSelectable && shiftKey && key === ' ') {
      assertIsValidKeyGetter<R, K>(rowKeyGetter);
      const rowKey = rowKeyGetter(row);
      selectRow({ row, checked: !effectiveSelectedRows.has(rowKey), isShiftClick: false });
      // prevent scrolling
      event.preventDefault();
      return;
    }

    if (isCellEditable(selectedPosition) && isDefaultCellInput(event, onCellPaste != null)) {
      setSelectedPosition(({ idx, rowIdx }) => ({
        idx,
        rowIdx,
        mode: 'EDIT',
        row,
        originalRow: row,
      }));
    }
  }

  function handleColumnResizeEnd() {
    // Remove temporary measured widths, restore flex sizing
    handleColumnResizeEndWidths();
    // This check is needed as double click on the resize handle triggers onPointerMove
    if (isColumnResizing) {
      // Re-read columnWidths after cleanup — the hook already updated the map
      onColumnWidthsChangeRaw?.(columnWidthsInternal);
      setColumnResizing(false);
    }
  }

  /**
   * utils
   */
  function isColIdxWithinSelectionBounds(idx: number) {
    return idx >= minColIdx && idx <= maxColIdx;
  }

  function isRowIdxWithinViewportBounds(rowIdx: number) {
    return rowIdx >= 0 && rowIdx < rows.length;
  }

  function isCellWithinSelectionBounds({ idx, rowIdx }: Position): boolean {
    return rowIdx >= minRowIdx && rowIdx <= maxRowIdx && isColIdxWithinSelectionBounds(idx);
  }

  function isCellWithinEditBounds({ idx, rowIdx }: Position): boolean {
    return isRowIdxWithinViewportBounds(rowIdx) && idx >= 0 && idx <= maxColIdx;
  }

  function isCellWithinViewportBounds({ idx, rowIdx }: Position): boolean {
    return isRowIdxWithinViewportBounds(rowIdx) && isColIdxWithinSelectionBounds(idx);
  }

  function isDataCellPosition({ idx, rowIdx }: Position): boolean {
    return isRowIdxWithinViewportBounds(rowIdx) && idx >= 0 && idx <= maxColIdx;
  }

  function isCellEditable(position: Position): boolean {
    return isCellWithinEditBounds(position) && isSelectedCellEditable({ columns, rows, selectedPosition: position });
  }

  function getNextPosition(key: string, ctrlKey: boolean, shiftKey: boolean): Position {
    const { idx, rowIdx } = selectedPosition;
    const isRowSelected = selectedCellIsWithinSelectionBounds && idx === -1;

    switch (key) {
      case 'ArrowUp':
        return { idx, rowIdx: rowIdx - 1 };
      case 'ArrowDown':
        return { idx, rowIdx: rowIdx + 1 };
      case leftKey:
        return { idx: idx - 1, rowIdx };
      case rightKey:
        return { idx: idx + 1, rowIdx };
      case 'Tab':
        return { idx: idx + (shiftKey ? -1 : 1), rowIdx };
      case 'Home':
        // If row is selected then move focus to the first row
        if (isRowSelected) return { idx, rowIdx: minRowIdx };
        return { idx: 0, rowIdx: ctrlKey ? minRowIdx : rowIdx };
      case 'End':
        // If row is selected then move focus to the last row.
        if (isRowSelected) return { idx, rowIdx: maxRowIdx };
        return { idx: maxColIdx, rowIdx: ctrlKey ? maxRowIdx : rowIdx };
      case 'PageUp': {
        if (selectedPosition.rowIdx === minRowIdx) return selectedPosition;
        const nextRowY = getRowTop(rowIdx) + getRowHeight(rowIdx) - clientHeight;
        return { idx, rowIdx: nextRowY > 0 ? findRowIdx(nextRowY) : 0 };
      }
      case 'PageDown': {
        if (selectedPosition.rowIdx >= rows.length) return selectedPosition;
        const nextRowY = getRowTop(rowIdx) + clientHeight;
        return { idx, rowIdx: nextRowY < totalRowHeight ? findRowIdx(nextRowY) : rows.length - 1 };
      }
      default:
        return selectedPosition;
    }
  }

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const { key, shiftKey } = event;
    let cellNavigationMode: CellNavigationMode = 'NONE';
    if (key === 'Tab') {
      if (
        canExitGrid({
          shiftKey,
          maxColIdx,
          minRowIdx,
          maxRowIdx,
          selectedPosition,
        })
      ) {
        commitEditorChanges();
        // Allow focus to leave the grid so the next control in the tab order can be focused
        return;
      }

      cellNavigationMode = 'CHANGE_ROW';
    }

    // prevent scrolling and do not allow focus to leave
    event.preventDefault();

    const ctrlKey = isCtrlKeyHeldDown(event);
    const nextPosition = getNextPosition(key, ctrlKey, shiftKey);
    if (isSamePosition(selectedPosition, nextPosition)) return;

    const nextSelectedCellPosition = getNextSelectedCellPosition({
      moveUp: key === 'ArrowUp',
      moveNext: key === rightKey || (key === 'Tab' && !shiftKey),
      columns,
      colSpanColumns,
      rows,
      minRowIdx,
      mainHeaderRowIdx,
      maxRowIdx,
      lastFrozenColumnIndex,
      cellNavigationMode,
      currentPosition: selectedPosition,
      nextPosition,
      isCellWithinBounds: isCellWithinSelectionBounds,
    });

    selectCell(nextSelectedCellPosition, {
      shouldFocusCell: true,
      extendSelection: cellSelectionMode === 'cell-range' && shiftKey,
    });
  }

  function getCellEditor(rowIdx: number) {
    if (
      !isCellWithinViewportBounds(selectedPosition) ||
      selectedPosition.rowIdx !== rowIdx ||
      selectedPosition.mode === 'SELECT'
    ) {
      return;
    }

    const { idx, row } = selectedPosition;
    const column = columns[idx];
    const colSpan = getColSpan(column, lastFrozenColumnIndex, { type: 'ROW', row });
    const closeOnExternalRowChange = column.editorOptions?.closeOnExternalRowChange ?? true;

    const closeEditor = (shouldFocusCell: boolean) => {
      shouldFocusCellRef.current = shouldFocusCell;
      // The cell didn't move while the editor was open, so suppress the scroll
      // half of the focus effect. Without this, closing the editor near the
      // viewport edge re-runs scrollIntoView on the cell and the page jumps
      // (the cell's `scroll-mt-32` for sticky-header avoidance is honored).
      skipScrollOnFocusRef.current = true;
      setSelectedPosition(({ idx, rowIdx }) => ({ idx, rowIdx, mode: 'SELECT' }));
    };

    const onRowChange = (row: R, commitChanges: boolean, shouldFocusCell: boolean) => {
      if (commitChanges) {
        // Guard: if commitEditorChanges already committed this edit (e.g. via selectCell
        // on click), skip to avoid firing onRowsChange twice for the same edit.
        if (editCommittedRef.current) return;
        editCommittedRef.current = true;
        // flushSync so `onRowsChange` runs (and any optimistic cache update inside
        // it) before we close the editor — without it, `commitEditorChanges` could
        // be called before the cell state flips to SELECT and `onRowChange` fires
        // a second time.
        //
        // Closing in the same flush keeps the editor lifecycle deterministic: no
        // arbitrary timer to "wait for the parent to re-render" (TanStack Query's
        // optimistic updates notify subscribers synchronously, so the parent's
        // next render already sees the committed row).
        flushSync(() => {
          updateRow(column, selectedPosition.rowIdx, row);
          closeEditor(shouldFocusCell);
        });
      } else {
        setSelectedPosition((position) => ({ ...position, row }));
      }
    };

    if (closeOnExternalRowChange && rows[selectedPosition.rowIdx] !== selectedPosition.originalRow) {
      // Discard changes if rows are updated from outside
      closeEditor(false);
    }

    return (
      <EditCell
        key={column.key}
        column={column}
        colSpan={colSpan}
        row={row}
        rowIdx={rowIdx}
        onRowChange={onRowChange}
        closeEditor={closeEditor}
        onKeyDown={onCellKeyDown}
        navigate={navigate}
      />
    );
  }

  function getViewportRows() {
    const rowElements: React.ReactNode[] = [];

    const { idx: selectedIdx, rowIdx: selectedRowIdx } = selectedPosition;

    const startRowIdx =
      selectedCellIsWithinViewportBounds && selectedRowIdx < rowOverscanStartIdx
        ? rowOverscanStartIdx - 1
        : rowOverscanStartIdx;
    const endRowIdx =
      selectedCellIsWithinViewportBounds && selectedRowIdx > rowOverscanEndIdx
        ? rowOverscanEndIdx + 1
        : rowOverscanEndIdx;

    for (let viewportRowIdx = startRowIdx; viewportRowIdx <= endRowIdx; viewportRowIdx++) {
      const isRowOutsideViewport =
        viewportRowIdx === rowOverscanStartIdx - 1 || viewportRowIdx === rowOverscanEndIdx + 1;
      const rowIdx = isRowOutsideViewport ? selectedRowIdx : viewportRowIdx;

      let rowColumns = columns;
      const selectedColumn = selectedIdx === -1 ? undefined : columns[selectedIdx];
      if (selectedColumn !== undefined) {
        if (isRowOutsideViewport) {
          // if the row is outside the viewport then only render the selected cell
          rowColumns = [selectedColumn];
        }
      }

      const row = rows[rowIdx];
      const gridRowStart = headerRowsCount + rowIdx + 1;
      let key: K | number = rowIdx;
      let isRowSelected = false;
      if (typeof rowKeyGetter === 'function') {
        key = rowKeyGetter(row);
        isRowSelected = effectiveSelectedRows?.has(key) ?? false;
      }

      rowElements.push(
        renderRow(key, {
          // aria-rowindex is 1 based
          'aria-rowindex': headerRowsCount + rowIdx + 1,
          'aria-selected': isSelectable ? isRowSelected : undefined,
          rowIdx,
          row,
          viewportColumns: rowColumns,
          isRowSelectionDisabled: isRowSelectionDisabled?.(row) ?? false,
          isRowSelected,
          onCellMouseDown: onCellMouseDownLatest,
          onCellClick: onCellClickLatest,
          onCellDoubleClick: onCellDoubleClickLatest,
          onCellContextMenu: onCellContextMenuLatest,
          isCellSelectionEnabled,
          rowClass,
          gridRowStart,
          selectedCellIdx: selectedRowIdx === rowIdx ? selectedIdx : undefined,
          lastFrozenColumnIndex,
          onRowChange: handleFormatterRowChangeLatest,
          selectCell: selectCellLatest,
          selectedCellEditor: getCellEditor(rowIdx),
          selectedCellRange: selectedCellRange ?? undefined,
          renderCell,
        }),
      );
    }

    return rowElements;
  }

  // Reset the positions if the current values are no longer valid. This can happen if a column or row is removed
  if (selectedPosition.idx > maxColIdx || selectedPosition.rowIdx > maxRowIdx) {
    setSelectedPosition({ idx: -1, rowIdx: minRowIdx - 1, mode: 'SELECT' });
  }

  // Keep the state and prop in sync
  if (isColumnWidthsControlled && columnWidthsInternal !== columnWidthsRaw) {
    setColumnWidthsInternal(columnWidthsRaw);
  }

  let templateRows = `repeat(${headerRowsCount}, ${headerRowHeight}px)`;
  if (rows.length > 0) {
    templateRows += gridTemplateRows;
  }

  const isGroupRowFocused = selectedPosition.idx === -1 && selectedPosition.rowIdx !== minRowIdx - 1;

  return (
    <div
      role={role ?? 'grid'}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-description={ariaDescription}
      aria-describedby={ariaDescribedBy}
      aria-multiselectable={isSelectable ? true : undefined}
      aria-colcount={columns.length}
      aria-rowcount={ariaRowCount}
      // Scrollable containers without tabIndex are keyboard focusable in Chrome only if there is no focusable element inside
      // whereas they are always focusable in Firefox. We need to set tabIndex to have a consistent behavior across browsers.
      tabIndex={-1}
      className={cn(
        'rdg grid h-full overflow-x-auto text-foreground text-sm accent-primary [contain:style]',
        {
          'rdg-readonly': readOnly,
          // When row body clicks select rows, suppress per-cell selection outline
          // (the row provides the visual feedback).
          'rdg-row-selection [&_.rdg-cell]:aria-selected:outline-none': rowSelectionMode !== 'none',
        },
        className,
      )}
      style={{
        // set scrollPadding to correctly position non-sticky cells after scrolling
        scrollPaddingInlineStart:
          selectedPosition.idx > lastFrozenColumnIndex ? `${totalFrozenColumnWidth}px` : undefined,
        scrollPaddingBlock: isRowIdxWithinViewportBounds(selectedPosition.rowIdx) ? `${headerRowsHeight}px` : undefined,
        gridTemplateColumns,
        gridTemplateRows: templateRows,
        '--rdg-header-row-height': `${headerRowHeight}px`,
        '--rdg-scroll-height': `${scrollHeight}px`,
        ...layoutCssVars,
      }}
      dir="ltr"
      ref={gridRef}
      onScroll={handleScroll}
      onKeyDown={isCellSelectionEnabled ? handleKeyDown : undefined}
      onCopy={isCellSelectionEnabled ? handleCellCopy : undefined}
      onPaste={isCellSelectionEnabled ? handleCellPaste : undefined}
      data-testid={testId}
      data-cy={dataCy}
      data-is-compact={isCompact || undefined}
    >
      {!hideHeader && (
        <HeaderRowSelectionChangeContext value={selectHeaderRowLatest}>
          <HeaderRowSelectionContext value={headerSelectionValue}>
            {Array.from({ length: groupedColumnHeaderRowsCount }, (_, index) => (
              <GroupedColumnHeaderRow
                // biome-ignore lint/suspicious/noArrayIndexKey: header rows are fixed-length and never reordered.
                key={index}
                rowIdx={index + 1}
                level={-groupedColumnHeaderRowsCount + index}
                columns={columns}
                selectedCellIdx={selectedPosition.rowIdx === minRowIdx + index ? selectedPosition.idx : undefined}
                selectCell={selectHeaderCellLatest}
                isCellSelectionEnabled={isCellSelectionEnabled}
              />
            ))}
            <HeaderRow
              headerRowClass={headerRowClass}
              rowIdx={headerRowsCount}
              columns={columns}
              onColumnResize={handleColumnResizeLatest}
              onColumnResizeEnd={handleColumnResizeEndLatest}
              onColumnsReorder={onColumnsReorderLastest}
              sortColumns={sortColumns}
              onSortColumnsChange={onSortColumnsChangeLatest}
              lastFrozenColumnIndex={lastFrozenColumnIndex}
              selectedCellIdx={selectedPosition.rowIdx === mainHeaderRowIdx ? selectedPosition.idx : undefined}
              selectCell={selectHeaderCellLatest}
              shouldFocusGrid={isCellSelectionEnabled && !selectedCellIsWithinSelectionBounds}
              isCellSelectionEnabled={isCellSelectionEnabled}
            />
          </HeaderRowSelectionContext>
        </HeaderRowSelectionChangeContext>
      )}
      {rows.length === 0 && noRowsFallback ? (
        noRowsFallback
      ) : (
        <RowSelectionChangeContext value={selectRowLatest}>{getViewportRows()}</RowSelectionChangeContext>
      )}

      {/* render empty cells that span only 1 column so we can safely measure column widths, regardless of colSpan */}
      {renderMeasuringCells(columns)}

      {/* extra div is needed for row navigation in a treegrid */}
      {isTreeGrid && (
        <div
          ref={focusSinkRef}
          tabIndex={isGroupRowFocused ? 0 : -1}
          className={cn('rdg-focus-sink pointer-events-none z-2 col-span-full', {
            'rdg-focus-sink-header-summary z-3': !isRowIdxWithinViewportBounds(selectedPosition.rowIdx),
            'outline-2 outline-primary outline-solid -outline-offset-2': isGroupRowFocused,
          })}
          style={{
            gridRowStart: selectedPosition.rowIdx + headerRowsCount + 1,
          }}
        />
      )}
    </div>
  );
}

function getCellToScroll(gridEl: HTMLDivElement) {
  return gridEl.querySelector<HTMLDivElement>(':scope > [role="row"] > [tabindex="0"]');
}

function isSamePosition(p1: Position, p2: Position) {
  return p1.idx === p2.idx && p1.rowIdx === p2.rowIdx;
}
