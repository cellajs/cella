import type { Key, KeyboardEvent } from 'react';
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  useGridDimensions,
  useViewportColumns,
  useViewportRows,
} from './hooks';
import { defaultRenderRow } from './row';
import type { PartialPosition } from './scroll-to-cell';
import { ScrollToCell } from './scroll-to-cell';
import { focusSinkClassname, focusSinkHeaderAndSummaryClassname, rootClassname } from './style/core';
import { rowSelected, rowSelectedWithFrozenCell } from './style/row';
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
  CellSelectArgs,
  Column,
  ColumnOrColumnGroup,
  ColumnWidths,
  Maybe,
  MobileSubRowConfig,
  Position,
  Renderers,
  RowsChangeData,
  SelectCellOptions,
  SelectedCellRangeChangeArgs,
  SelectHeaderRowEvent,
  SelectionMode,
  SelectRowEvent,
  SortColumn,
  TouchModeConfig,
} from './types';
import {
  assertIsValidKeyGetter,
  canExitGrid,
  cn,
  createCellEvent,
  createRange,
  evaluateMobileSubRows,
  evaluateTouchMode,
  getColSpan,
  getLeftRightKey,
  getNextSelectedCellPosition,
  isCtrlKeyHeldDown,
  isDefaultCellInput,
  isSelectedCellEditable,
  renderMeasuringCells,
  scrollIntoView,
  sign,
} from './utils';

export interface SelectCellState extends Position {
  readonly mode: 'SELECT';
}

interface EditCellState<R> extends Position {
  readonly mode: 'EDIT';
  readonly row: R;
  readonly originalRow: R;
}

// TODO-017 seems to be heavy when resizing browser tab, please investigate

/** Arguments passed to onRowsEndApproaching callback */
export interface RowsEndApproachingArgs {
  /** Index of the last row being rendered (with overscan) */
  rowOverscanEndIdx: number;
  /** Total number of rows in the dataset */
  totalRows: number;
  /** Number of rows remaining until the end */
  rowsRemaining: number;
}

export type DefaultColumnOptions<R, SR> = Pick<
  Column<R, SR>,
  'renderCell' | 'renderHeaderCell' | 'width' | 'minWidth' | 'maxWidth' | 'resizable' | 'sortable' | 'draggable'
>;

export interface DataGridHandle {
  element: HTMLDivElement | null;
  scrollToCell: (position: PartialPosition) => void;
  selectCell: (position: Position, options?: SelectCellOptions) => void;
}

type SharedDivProps = Pick<
  React.ComponentProps<'div'>,
  | 'role'
  | 'aria-label'
  | 'aria-labelledby'
  | 'aria-description'
  | 'aria-describedby'
  | 'aria-rowcount'
  | 'className'
  | 'style'
>;

export interface DataGridProps<R, SR = unknown, K extends Key = Key> extends SharedDivProps {
  ref?: Maybe<React.Ref<DataGridHandle>>;
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
   * Enable column virtualization independently
   * When set, overrides enableVirtualization for columns
   */
  enableColumnVirtualization?: Maybe<boolean>;
  /**
   * Selection mode for cells and rows
   * - 'none': Selection is disabled
   * - 'cell': Single cell selection only
   * - 'cell-range': Multi-cell range selection with shift+click/arrow
   * - 'row': Single row selection
   * - 'row-multi': Multiple row selection (default)
   * @default 'row-multi'
   */
  selectionMode?: Maybe<SelectionMode>;
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
   * Enable touch-friendly mode with larger touch targets
   * - true: Always enabled
   * - false: Always disabled
   * - { max: breakpoint }: Enable below breakpoint
   * - { min: breakpoint }: Enable at or above breakpoint
   * @default false
   */
  touchMode?: Maybe<TouchModeConfig>;
  /**
   * Enable mobile sub-row rendering for columns with mobileRole="sub"
   * - true: Always enabled
   * - false: Always disabled
   * - { max: breakpoint }: Enable below breakpoint
   * @default false
   */
  enableMobileSubRows?: Maybe<MobileSubRowConfig>;
  /**
   * Set of row indices that are expanded to show mobile sub-rows
   * Use with onExpandedRowsChange for controlled expansion
   */
  expandedRows?: Maybe<ReadonlySet<number>>;
  /**
   * Callback triggered when expanded rows change
   */
  onExpandedRowsChange?: Maybe<(expandedRows: Set<number>) => void>;

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
    ref,
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
    onCellCopy,
    onCellPaste,
    // Toggles and modes
    enableVirtualization: rawEnableVirtualization,
    enableRowVirtualization: rawEnableRowVirtualization,
    enableColumnVirtualization: rawEnableColumnVirtualization,
    selectionMode: rawSelectionMode,
    selectedCellRange: selectedCellRangeProp,
    onSelectedCellRangeChange,
    touchMode: rawTouchMode,
    enableMobileSubRows: rawEnableMobileSubRows,
    expandedRows: expandedRowsProp,
    onExpandedRowsChange,
    // Infinite scroll
    onRowsEndApproaching,
    rowsEndApproachingThreshold: rawRowsEndApproachingThreshold,
    // Miscellaneous
    renderers,
    className,
    style,
    rowClass,
    headerRowClass,
    // ARIA
    role: rawRole,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-description': ariaDescription,
    'aria-describedby': ariaDescribedBy,
    'aria-rowcount': rawAriaRowCount,
    'data-testid': testId,
    'data-cy': dataCy,
  } = props;

  /**
   * defaults
   */
  const role = rawRole ?? 'grid';
  const rowHeight = rawRowHeight ?? 35;
  const headerRowHeight = rawHeaderRowHeight ?? (typeof rowHeight === 'number' ? rowHeight : 35);
  const renderRow = renderers?.renderRow ?? defaultRenderRow;
  const renderCell = renderers?.renderCell ?? defaultRenderCell;
  const noRowsFallback = renderers?.noRowsFallback;
  const enableVirtualization = rawEnableVirtualization ?? true;
  const enableRowVirtualization = rawEnableRowVirtualization ?? enableVirtualization;
  const enableColumnVirtualization = rawEnableColumnVirtualization ?? enableVirtualization;
  const selectionMode: SelectionMode = rawSelectionMode ?? 'row-multi';
  const isCellSelectionEnabled = selectionMode !== 'none';
  // Default threshold: 25% of rows, minimum 10, maximum 50
  const rowsEndApproachingThreshold =
    rawRowsEndApproachingThreshold ?? Math.min(50, Math.max(10, Math.floor(rows.length * 0.25)));

  // Get current breakpoint for responsive features
  const currentBreakpoint = useCurrentBreakpoint();

  // Disable row selection on mobile breakpoints (xs, sm)
  const isMobileBreakpoint = currentBreakpoint === 'xs' || currentBreakpoint === 'sm';
  const effectiveSelectedRows = isMobileBreakpoint ? undefined : selectedRows;
  const effectiveOnSelectedRowsChange = isMobileBreakpoint ? undefined : onSelectedRowsChange;

  // Evaluate touch mode and mobile sub-rows based on current breakpoint
  const isTouchModeActive = evaluateTouchMode(rawTouchMode ?? false, currentBreakpoint);
  const isMobileSubRowsActive = evaluateMobileSubRows(rawEnableMobileSubRows ?? false, currentBreakpoint);

  /**
   * states
   */
  const [columnWidthsInternal, setColumnWidthsInternal] = useState((): ColumnWidths => columnWidthsRaw ?? new Map());
  const [isColumnResizing, setColumnResizing] = useState(false);
  const [scrollToPosition, setScrollToPosition] = useState<PartialPosition | null>(null);
  const [shouldFocusCell, setShouldFocusCell] = useState(false);
  const [previousRowIdx, setPreviousRowIdx] = useState(-1);
  const [selectedCellRangeInternal, setSelectedCellRangeInternal] = useState<CellRange | null>(null);
  const [cellRangeAnchor, setCellRangeAnchor] = useState<Position | null>(null);
  const [expandedRowsInternal, setExpandedRowsInternal] = useState<Set<number>>(new Set());

  // Controlled vs uncontrolled cell range
  const isSelectedCellRangeControlled = selectedCellRangeProp !== undefined && onSelectedCellRangeChange != null;
  const selectedCellRange = isSelectedCellRangeControlled ? selectedCellRangeProp : selectedCellRangeInternal;
  const setSelectedCellRange = isSelectedCellRangeControlled
    ? (range: CellRange | null) => {
        onSelectedCellRangeChange({ range });
      }
    : setSelectedCellRangeInternal;

  // Controlled vs uncontrolled expanded rows
  const isExpandedRowsControlled = expandedRowsProp != null && onExpandedRowsChange != null;
  const expandedRows = isExpandedRowsControlled ? expandedRowsProp : expandedRowsInternal;
  const setExpandedRows = isExpandedRowsControlled
    ? (rows: Set<number>) => onExpandedRowsChange(rows)
    : setExpandedRowsInternal;

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

  const {
    gridRef,
    inlineSize: gridWidth,
    viewportHeight,
    horizontalScrollbarHeight,
    scrollTop,
    scrollLeft,
  } = useGridDimensions();
  const {
    columns,
    colSpanColumns,
    lastFrozenColumnIndex,
    headerRowsCount,
    colOverscanStartIdx,
    colOverscanEndIdx,
    templateColumns,
    layoutCssVars,
    totalFrozenColumnWidth,
    subColumns,
  } = useCalculatedColumns({
    rawColumns,
    defaultColumnOptions,
    getColumnWidth,
    scrollLeft,
    viewportWidth: gridWidth,
    enableVirtualization: enableColumnVirtualization,
    currentBreakpoint,
    isMobileSubRowsActive,
  });

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
    // Only 'row-multi' mode supports header selection (select all)
    if (selectionMode !== 'row-multi') {
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
  }, [rows, effectiveSelectedRows, rowKeyGetter, selectionMode]);

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

  const viewportColumns = useViewportColumns({
    columns,
    colSpanColumns,
    colOverscanStartIdx,
    colOverscanEndIdx,
    lastFrozenColumnIndex,
    rowOverscanStartIdx,
    rowOverscanEndIdx,
    rows,
  });

  const { gridTemplateColumns, handleColumnResize } = useColumnWidths(
    columns,
    viewportColumns,
    templateColumns,
    gridRef,
    gridWidth,
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
  const handleToggleRowExpandLatest = useLatestCallback(handleToggleRowExpand);

  /**
   * callbacks
   */
  function handleToggleRowExpand(rowIdx: number) {
    const newExpandedRows = new Set(expandedRows);
    if (newExpandedRows.has(rowIdx)) {
      newExpandedRows.delete(rowIdx);
    } else {
      newExpandedRows.add(rowIdx);
    }
    setExpandedRows(newExpandedRows);
  }
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
    if (shouldFocusCell) {
      if (focusSinkRef.current !== null && selectedPosition.idx === -1) {
        focusSinkRef.current.focus({ preventScroll: true });
        scrollIntoView(focusSinkRef.current);
      } else {
        focusCell();
      }
      setShouldFocusCell(false);
    }
  }, [shouldFocusCell, focusCell, selectedPosition.idx]);

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

    if (selectionMode !== 'cell-range') {
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
    selectionMode,
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

  /**
   * Infinite scroll: fires onRowsEndApproaching when user scrolls near the end of data.
   * Uses rowOverscanEndIdx from virtualization to detect scroll position.
   * Tracks lastFiredForRowsLength to prevent re-triggering after new data loads.
   */
  const lastFiredForRowsLengthRef = useRef(0);

  useEffect(() => {
    if (!onRowsEndApproaching || rows.length === 0) return;

    const isApproachingEnd = rowOverscanEndIdx >= rows.length - rowsEndApproachingThreshold;

    // Fire callback when approaching end, but only once per rows.length
    // (prevents re-triggering immediately after new data arrives)
    if (isApproachingEnd && lastFiredForRowsLengthRef.current !== rows.length) {
      lastFiredForRowsLengthRef.current = rows.length;
      onRowsEndApproaching({
        rowOverscanEndIdx,
        totalRows: rows.length,
        rowsRemaining: rows.length - 1 - rowOverscanEndIdx,
      });
    }
  }, [onRowsEndApproaching, rowOverscanEndIdx, rows.length, rowsEndApproachingThreshold]);

  useImperativeHandle(
    ref,
    (): DataGridHandle => ({
      element: gridRef.current,
      scrollToCell({ idx, rowIdx }) {
        const scrollToIdx = idx !== undefined && idx > lastFrozenColumnIndex && idx < columns.length ? idx : undefined;
        const scrollToRowIdx = rowIdx !== undefined && isRowIdxWithinViewportBounds(rowIdx) ? rowIdx : undefined;

        if (scrollToIdx !== undefined || scrollToRowIdx !== undefined) {
          setScrollToPosition({ idx: scrollToIdx, rowIdx: scrollToRowIdx });
        }
      },
      selectCell,
    }),
  );

  /**
   * event handlers
   */
  function selectHeaderRow(args: SelectHeaderRowEvent) {
    if (!effectiveOnSelectedRowsChange) return;
    // Only 'row-multi' mode supports header selection (select all)
    if (selectionMode !== 'row-multi') return;

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
    // Row selection only works in 'row' and 'row-multi' modes
    if (selectionMode !== 'row' && selectionMode !== 'row-multi') return;

    assertIsValidKeyGetter<R, K>(rowKeyGetter);
    const { row, checked, isShiftClick } = args;
    if (isRowSelectionDisabled?.(row) === true) return;

    // In 'row' mode, only allow one row to be selected
    if (selectionMode === 'row') {
      const rowKey = rowKeyGetter(row);
      const newSelectedRows = checked ? new Set([rowKey]) : new Set<K>();
      effectiveOnSelectedRowsChange(newSelectedRows);
      return;
    }

    // 'row-multi' mode - default behavior
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
    // Scroll state is now managed by useGridDimensions hook
    // This handler only passes the event to the consumer
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
    const { idx, rowIdx } = selectedPosition;
    const column = columns[idx];
    const row = rows[rowIdx];
    const value = row[column.key as keyof R];
    onCellCopy?.({ row, column, rowIdx, value }, event);
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
    // This check is needed as double click on the resize handle triggers onPointerMove
    if (isColumnResizing) {
      onColumnWidthsChangeRaw?.(columnWidths);
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

  function selectCell(position: Position, options?: SelectCellOptions): void {
    if (!isCellSelectionEnabled) return;
    if (!isCellWithinSelectionBounds(position)) return;
    commitEditorChanges();

    const samePosition = isSamePosition(selectedPosition, position);

    if (options?.enableEditor && isCellEditable(position)) {
      const row = rows[position.rowIdx];
      setSelectedPosition({ ...position, mode: 'EDIT', row, originalRow: row });
    } else if (samePosition) {
      // Avoid re-renders if the selected cell state is the same
      scrollIntoView(getCellToScroll(gridRef.current!));
    } else {
      setShouldFocusCell(options?.shouldFocusCell === true);
      setSelectedPosition({ ...position, mode: 'SELECT' });
    }

    if (onSelectedCellChange && !samePosition) {
      onSelectedCellChange({
        rowIdx: position.rowIdx,
        row: isRowIdxWithinViewportBounds(position.rowIdx) ? rows[position.rowIdx] : undefined,
        column: columns[position.idx],
      });
    }

    if (selectionMode === 'cell-range') {
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
  }

  function selectHeaderCell({ idx, rowIdx }: Position): void {
    selectCell({ rowIdx: minRowIdx + rowIdx - 1, idx });
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
      extendSelection: selectionMode === 'cell-range' && shiftKey,
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
      setShouldFocusCell(shouldFocusCell);
      setSelectedPosition(({ idx, rowIdx }) => ({ idx, rowIdx, mode: 'SELECT' }));
    };

    const onRowChange = async (row: R, commitChanges: boolean, shouldFocusCell: boolean) => {
      if (commitChanges) {
        // Guard: if commitEditorChanges already committed this edit (e.g. via selectCell
        // on click), skip to avoid firing onRowsChange twice for the same edit.
        if (editCommittedRef.current) return;
        editCommittedRef.current = true;
        // Prevents two issues when editor is closed by clicking on a different cell
        //
        // Otherwise commitEditorChanges may be called before the cell state is changed to
        // SELECT and this results in onRowChange getting called twice.
        flushSync(() => {
          updateRow(column, selectedPosition.rowIdx, row);
        });
        // Brief delay allows optimistic updates to propagate to cache before editor closes
        await new Promise((r) => setTimeout(r, 200));
        closeEditor(shouldFocusCell);
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

  function getRowViewportColumns(rowIdx: number) {
    // idx can be -1 if grouping is enabled
    const selectedColumn = selectedPosition.idx === -1 ? undefined : columns[selectedPosition.idx];
    if (
      selectedColumn !== undefined &&
      selectedPosition.rowIdx === rowIdx &&
      !viewportColumns.includes(selectedColumn)
    ) {
      // Add the selected column to viewport columns if the cell is not within the viewport
      return selectedPosition.idx > colOverscanEndIdx
        ? [...viewportColumns, selectedColumn]
        : [
            ...viewportColumns.slice(0, lastFrozenColumnIndex + 1),
            selectedColumn,
            ...viewportColumns.slice(lastFrozenColumnIndex + 1),
          ];
    }
    return viewportColumns;
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

      let rowColumns = viewportColumns;
      const selectedColumn = selectedIdx === -1 ? undefined : columns[selectedIdx];
      if (selectedColumn !== undefined) {
        if (isRowOutsideViewport) {
          // if the row is outside the viewport then only render the selected cell
          rowColumns = [selectedColumn];
        } else {
          // if the row is within the viewport and cell is not, add the selected column to viewport columns
          rowColumns = getRowViewportColumns(rowIdx);
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
          rowClass,
          gridRowStart,
          selectedCellIdx: selectedRowIdx === rowIdx ? selectedIdx : undefined,
          lastFrozenColumnIndex,
          onRowChange: handleFormatterRowChangeLatest,
          selectCell: selectCellLatest,
          selectedCellEditor: getCellEditor(rowIdx),
          selectedCellRange: selectedCellRange ?? undefined,
          renderCell,
          subColumns: isMobileSubRowsActive && subColumns.length > 0 ? subColumns : undefined,
          isRowExpanded: expandedRows.has(rowIdx),
          onToggleRowExpand: handleToggleRowExpandLatest,
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
      role={role}
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
        rootClassname,
        {
          'rdg-touch-mode': isTouchModeActive,
          'rdg-mobile-sub-rows': isMobileSubRowsActive && subColumns.length > 0,
        },
        className,
      )}
      style={{
        ...style,
        // set scrollPadding to correctly position non-sticky cells after scrolling
        scrollPaddingInlineStart:
          selectedPosition.idx > lastFrozenColumnIndex || scrollToPosition?.idx !== undefined
            ? `${totalFrozenColumnWidth}px`
            : undefined,
        scrollPaddingBlock:
          isRowIdxWithinViewportBounds(selectedPosition.rowIdx) || scrollToPosition?.rowIdx !== undefined
            ? `${headerRowsHeight}px`
            : undefined,
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
    >
      <HeaderRowSelectionChangeContext value={selectHeaderRowLatest}>
        <HeaderRowSelectionContext value={headerSelectionValue}>
          {Array.from({ length: groupedColumnHeaderRowsCount }, (_, index) => (
            <GroupedColumnHeaderRow
              key={index}
              rowIdx={index + 1}
              level={-groupedColumnHeaderRowsCount + index}
              columns={getRowViewportColumns(minRowIdx + index)}
              selectedCellIdx={selectedPosition.rowIdx === minRowIdx + index ? selectedPosition.idx : undefined}
              selectCell={selectHeaderCellLatest}
            />
          ))}
          <HeaderRow
            headerRowClass={headerRowClass}
            rowIdx={headerRowsCount}
            columns={getRowViewportColumns(mainHeaderRowIdx)}
            onColumnResize={handleColumnResizeLatest}
            onColumnResizeEnd={handleColumnResizeEndLatest}
            onColumnsReorder={onColumnsReorderLastest}
            sortColumns={sortColumns}
            onSortColumnsChange={onSortColumnsChangeLatest}
            lastFrozenColumnIndex={lastFrozenColumnIndex}
            selectedCellIdx={selectedPosition.rowIdx === mainHeaderRowIdx ? selectedPosition.idx : undefined}
            selectCell={selectHeaderCellLatest}
            shouldFocusGrid={isCellSelectionEnabled && !selectedCellIsWithinSelectionBounds}
          />
        </HeaderRowSelectionContext>
      </HeaderRowSelectionChangeContext>
      {rows.length === 0 && noRowsFallback ? (
        noRowsFallback
      ) : (
        <RowSelectionChangeContext value={selectRowLatest}>{getViewportRows()}</RowSelectionChangeContext>
      )}

      {/* render empty cells that span only 1 column so we can safely measure column widths, regardless of colSpan */}
      {renderMeasuringCells(viewportColumns)}

      {/* extra div is needed for row navigation in a treegrid */}
      {isTreeGrid && (
        <div
          ref={focusSinkRef}
          tabIndex={isGroupRowFocused ? 0 : -1}
          className={cn(focusSinkClassname, {
            [focusSinkHeaderAndSummaryClassname]: !isRowIdxWithinViewportBounds(selectedPosition.rowIdx),
            [rowSelected]: isGroupRowFocused,
            [rowSelectedWithFrozenCell]: isGroupRowFocused && lastFrozenColumnIndex !== -1,
          })}
          style={{
            gridRowStart: selectedPosition.rowIdx + headerRowsCount + 1,
          }}
        />
      )}

      {scrollToPosition !== null && (
        <ScrollToCell
          scrollToPosition={scrollToPosition}
          setScrollToCellPosition={setScrollToPosition}
          gridRef={gridRef}
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
