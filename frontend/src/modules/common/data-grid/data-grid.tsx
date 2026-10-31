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
  measureAllColumnWidths,
  RowSelectionChangeContext,
  useCalculatedColumns,
  useColumnWidths,
  useDragAutoScroll,
  useGridDimensions,
  useMeasuredRowHeights,
  useNearEnd,
  useViewportRows,
} from './hooks';
import { useStickyHeader } from './hooks/use-sticky-header';
import { defaultRenderRow } from './row';
import { RowDragCell, type RowDragConfig, RowDropTarget } from './row-drag';
import type {
  ActiveModes,
  CalculatedColumn,
  CellClipboardEvent,
  CellCopyArgs,
  CellKeyboardEvent,
  CellKeyDownArgs,
  CellMouseEventHandler,
  CellNavigationMode,
  CellPasteArgs,
  CellRendererProps,
  CellSelectArgs,
  ColumnOrColumnGroup,
  ColumnWidths,
  DefaultColumnOptions,
  Maybe,
  Position,
  Renderers,
  RenderRowProps,
  RowsChangeData,
  SelectCellOptions,
  SelectHeaderRowEvent,
  SelectRowEvent,
  SortColumn,
} from './types';
import {
  assertIsValidKeyGetter,
  canExitGrid,
  cellValueToText,
  cn,
  computeMergedSlotExtraHeight,
  computeWrapTextRowHeight,
  createCellEvent,
  getColSpan,
  getLeftRightKey,
  getNextSelectedCellPosition,
  hasWrapTextColumns,
  isCtrlKeyHeldDown,
  isDefaultCellInput,
  isSelectedCellEditable,
  renderMeasuringCells,
  scrollIntoView,
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

type SharedDivProps = Pick<
  React.ComponentProps<'div'>,
  'aria-label' | 'aria-labelledby' | 'aria-description' | 'aria-describedby' | 'aria-rowcount' | 'className'
>;

export interface DataGridProps<R, SR = unknown, K extends Key = Key> extends SharedDivProps {
  // Grid and data
  columns: readonly ColumnOrColumnGroup<NoInfer<R>, NoInfer<SR>>[];
  rows: readonly R[];
  rowKeyGetter?: Maybe<(row: NoInfer<R>) => K>;
  onRowsChange?: Maybe<(rows: NoInfer<R>[], data: RowsChangeData<NoInfer<R>, NoInfer<SR>>) => void>;

  // Dimensions
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
  columnWidths?: Maybe<ColumnWidths>;
  onColumnWidthsChange?: Maybe<(columnWidths: ColumnWidths) => void>;

  // Features
  selectedRows?: Maybe<ReadonlySet<K>>;
  isRowSelectionDisabled?: Maybe<(row: NoInfer<R>) => boolean>;
  onSelectedRowsChange?: Maybe<(selectedRows: Set<NoInfer<K>>) => void>;
  sortColumns?: Maybe<readonly SortColumn[]>;
  onSortColumnsChange?: Maybe<(sortColumns: SortColumn[]) => void>;
  defaultColumnOptions?: Maybe<DefaultColumnOptions<NoInfer<R>, NoInfer<SR>>>;

  // Event props
  onCellMouseDown?: CellMouseEventHandler<R, SR>;
  onCellClick?: CellMouseEventHandler<R, SR>;
  onCellDoubleClick?: CellMouseEventHandler<R, SR>;
  onCellContextMenu?: CellMouseEventHandler<R, SR>;
  onCellKeyDown?: Maybe<(args: CellKeyDownArgs<NoInfer<R>, NoInfer<SR>>, event: CellKeyboardEvent) => void>;
  onCellCopy?: Maybe<(args: CellCopyArgs<NoInfer<R>, NoInfer<SR>>, event: CellClipboardEvent) => void>;
  onCellPaste?: Maybe<(args: CellPasteArgs<NoInfer<R>, NoInfer<SR>>, event: CellClipboardEvent) => NoInfer<R>>;
  onSelectedCellChange?: Maybe<(args: CellSelectArgs<NoInfer<R>, NoInfer<SR>>) => void>;
  onScroll?: Maybe<(event: React.UIEvent<HTMLDivElement>) => void>;
  onColumnResize?: Maybe<(column: CalculatedColumn<R, SR>, width: number) => void>;
  onColumnsReorder?: Maybe<(sourceColumnKey: string, targetColumnKey: string) => void>;
  /** Enable handle-column row reordering with per-row drop targets and indicators. */
  onRowReorder?: Maybe<(fromIdx: number, toIdx: number, edge: 'top' | 'bottom') => void>;
  /** When provided, the middle 50% of each row becomes a "reparent" drop zone for tree-structured data. */
  onRowReparent?: Maybe<(fromIdx: number, toIdx: number) => void>;
  /** Checked on every drag move, falling back to the nearest allowed zone; no allowed zone suppresses the indicator and drop callback. */
  canDropRow?: Maybe<(args: { fromIdx: number; toIdx: number; zone: 'top' | 'bottom' | 'center' }) => boolean>;
  /** Content rendered inside the native drag preview. Defaults to a generic preview. */
  renderRowDragPreview?: Maybe<(row: NoInfer<R>) => React.ReactNode>;

  // Toggles and modes
  /** @default true */
  enableVirtualization?: Maybe<boolean>;
  /** Overrides enableVirtualization for rows when set. */
  enableRowVirtualization?: Maybe<boolean>;
  /** Pin header rows below the sticky stack while a window-scrolled grid passes the top of the viewport. @default true from the `sm` breakpoint up */
  enableStickyHeader?: Maybe<boolean>;
  /** Vertical auto-scroll of the viewport during pragmatic-dnd drag. Opt-in; only for row-drag tables. @default false */
  enableDragAutoScroll?: Maybe<boolean>;

  // Infinite scroll
  /** Level-triggered near-end state, reported as false on exit and on unmount. */
  onNearEndChange?: Maybe<(nearEnd: boolean) => void>;
  /**
   * Number of rows from the end at which onNearEndChange reports true.
   * @default Dynamic: 25% of rows, clamped between 10 and 50
   */
  nearEndThreshold?: Maybe<number>;

  // Miscellaneous
  renderers?: Maybe<Renderers<NoInfer<R>, NoInfer<SR>>>;
  rowClass?: Maybe<(row: NoInfer<R>, rowIdx: number) => Maybe<string>>;
  headerRowClass?: Maybe<string>;
  /** Enable compact column overrides and the root data-is-compact attribute. */
  isCompact?: Maybe<boolean>;
  hideHeader?: Maybe<boolean>;
  'data-testid'?: Maybe<string>;
  'data-cy'?: Maybe<string>;
}

const emptyColumnWidths: ReadonlyMap<string, number> = new Map();

/** Compare rendered-width maps, ignoring sub-pixel jitter, to skip redundant state updates. */
function sameColumnWidths(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, width] of a) {
    const other = b.get(key);
    if (other === undefined || Math.abs(other - width) > 0.5) return false;
  }
  return true;
}

/** Virtualized grid primitive; query-backed tables use the `DataTable` wrapper for loading, error, empty and infinite-scroll states. */
export function DataGrid<R, SR = unknown, K extends Key = Key>(props: DataGridProps<R, SR, K>) {
  const {
    columns: rawColumns,
    rows,
    rowKeyGetter,
    onRowsChange,
    rowHeight: rawRowHeight,
    headerRowHeight: rawHeaderRowHeight,
    columnWidths: columnWidthsRaw,
    onColumnWidthsChange: onColumnWidthsChangeRaw,
    selectedRows,
    isRowSelectionDisabled,
    onSelectedRowsChange,
    sortColumns,
    onSortColumnsChange,
    defaultColumnOptions,
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
    enableVirtualization: rawEnableVirtualization,
    enableRowVirtualization: rawEnableRowVirtualization,
    enableStickyHeader: rawEnableStickyHeader,
    enableDragAutoScroll: rawEnableDragAutoScroll,
    onNearEndChange,
    nearEndThreshold: rawNearEndThreshold,
    renderers,
    className,
    rowClass,
    headerRowClass,
    // ARIA
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-description': ariaDescription,
    'aria-describedby': ariaDescribedBy,
    'aria-rowcount': rawAriaRowCount,
    isCompact,
    hideHeader,
    'data-testid': testId,
    'data-cy': dataCy,
  } = props;

  // defaults
  const baseRowHeight = rawRowHeight ?? 35;
  const headerRowHeight = hideHeader ? 0 : (rawHeaderRowHeight ?? (typeof baseRowHeight === 'number' ? baseRowHeight : 35));
  const userRenderRow = renderers?.renderRow ?? defaultRenderRow;
  const userRenderCell = renderers?.renderCell ?? defaultRenderCell;
  // Latest refs keep the row-drag config stable when consumers pass non-memoized callbacks.
  const onRowReorderLatest = useLatestCallback(onRowReorder ?? (() => {}));
  const onRowReparentLatest = useLatestCallback(onRowReparent ?? (() => {}));
  const canDropRowLatest = useLatestCallback(canDropRow ?? (() => true));
  const renderRowDragPreviewLatest = useLatestCallback(renderRowDragPreview ?? (() => null));
  // Row-DnD renderCell identity keys only on which features are enabled, not on consumer callbacks.
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
  // Row DnD: handle cells become drag sources and each row box becomes one drop target.
  const renderCell = useMemo(() => {
    if (!rowDragConfig) return userRenderCell;
    return (key: Key, props: CellRendererProps<R, SR>) =>
      props.column.rowDragHandle === true ? <RowDragCell<R, SR> key={key} {...props} config={rowDragConfig} /> : userRenderCell(key, props);
  }, [rowDragConfig, userRenderCell]);
  const renderRow = useMemo(() => {
    if (!rowDragConfig) return userRenderRow;
    return (key: Key, props: RenderRowProps<R, SR>) => (
      <RowDropTarget<R, SR> key={key} rowKey={key} {...props} config={rowDragConfig} renderRow={userRenderRow} />
    );
  }, [rowDragConfig, userRenderRow]);
  const noRowsFallback = renderers?.noRowsFallback;
  const enableVirtualization = rawEnableVirtualization ?? true;
  const enableRowVirtualization = rawEnableRowVirtualization ?? enableVirtualization;
  const enableDragAutoScroll = rawEnableDragAutoScroll ?? false;

  const currentBreakpoint = useCurrentBreakpoint();

  // 'compact' is the density toggle, 'mobile' is the xs breakpoint; columns key `modes` overrides off both.
  const isMobileBreakpoint = currentBreakpoint === 'xs';
  const activeModes = useMemo<ActiveModes>(() => ({ compact: isCompact ?? false, mobile: isMobileBreakpoint }), [isCompact, isMobileBreakpoint]);

  // Disable row selection on the smallest breakpoint (xs) where checkboxes are hidden
  const effectiveSelectedRows = isMobileBreakpoint ? undefined : selectedRows;
  const effectiveOnSelectedRowsChange = isMobileBreakpoint ? undefined : onSelectedRowsChange;

  // On the smallest breakpoint (xs) the header is not pinned by default: it takes a row of a short screen. An explicit value wins.
  const enableStickyHeader = (rawEnableStickyHeader ?? !isMobileBreakpoint) && !hideHeader;

  // states
  const [columnWidthsInternal, setColumnWidthsInternal] = useState((): ColumnWidths => columnWidthsRaw ?? new Map());
  const [isColumnResizing, setColumnResizing] = useState(false);
  const shouldFocusCellRef = useRef(false);
  // Skip scrolling when an editor closes onto the same cell: its sticky-header margin jumps the page near viewport edges.
  const skipScrollOnFocusRef = useRef(false);
  // The row a Shift-click extends from, by key: its index changes when the rows sort or filter.
  const [selectionAnchorKey, setSelectionAnchorKey] = useState<K | null>(null);

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

  const { gridRef, viewportHeight, scrollTop, measured } = useGridDimensions(undefined, enableRowVirtualization);

  const { columns, colSpanColumns, lastFrozenColumnIndex, headerRowsCount, templateColumns, layoutCssVars, totalFrozenColumnWidth } =
    useCalculatedColumns({ rawColumns, defaultColumnOptions, getColumnWidth, currentBreakpoint, activeModes });

  // Motion-animated reorder needs all four conditions: virtualized rows unmount mid-scroll and break FLIP, index keys defeat DOM persistence, transforms unstick frozen cells.
  const animateReorder = rowDragEnabled && !enableRowVirtualization && typeof rowKeyGetter === 'function' && lastFrozenColumnIndex === -1;

  useStickyHeader(gridRef, headerRowsCount, headerRowHeight, enableStickyHeader);

  useDragAutoScroll(gridRef, enableDragAutoScroll);

  // Measuring cells expose flex-resolved widths so wrapped-row estimates follow resizing; only wrap-text tables observe.
  const [renderedColumnWidths, setRenderedColumnWidths] = useState<ReadonlyMap<string, number>>(emptyColumnWidths);
  const wrapTextEnabled = hasWrapTextColumns(columns);
  useLayoutEffect(() => {
    if (!wrapTextEnabled) {
      setRenderedColumnWidths((prev) => (prev.size === 0 ? prev : emptyColumnWidths));
      return;
    }
    const grid = gridRef.current;
    const remeasure = () => {
      const next = measureAllColumnWidths(gridRef);
      setRenderedColumnWidths((prev) => (sameColumnWidths(prev, next) ? prev : next));
    };
    remeasure();
    if (!grid || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(remeasure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [wrapTextEnabled, columns, gridRef]);

  // Row heights resolve before virtualization for wrapped and merged content; mobile scales for touch targets.
  const rowHeight = useMemo(() => {
    const slotExtra = computeMergedSlotExtraHeight(columns);
    const mobileScale = isMobileBreakpoint ? 1.2 : 1;
    if (typeof baseRowHeight === 'function') {
      if (mobileScale === 1 && slotExtra === 0) return baseRowHeight;
      return (row: R) => baseRowHeight(row) * mobileScale + slotExtra;
    }
    const scaledBase = baseRowHeight * mobileScale;
    if (!hasWrapTextColumns(columns)) {
      return slotExtra === 0 ? scaledBase : () => scaledBase + slotExtra;
    }
    const getRenderedWidth = (column: CalculatedColumn<R, unknown>) =>
      renderedColumnWidths.get(column.key) ?? (typeof column.width === 'number' ? column.width : column.minWidth);
    const wrapColumns = columns as readonly CalculatedColumn<R, unknown>[];
    return (row: R) => computeWrapTextRowHeight(scaledBase, wrapColumns, row, getRenderedWidth) + slotExtra;
  }, [baseRowHeight, columns, isMobileBreakpoint, renderedColumnWidths]);

  const getMeasuredRowKey = useLatestCallback((row: R, rowIdx: number): unknown => (typeof rowKeyGetter === 'function' ? rowKeyGetter(row) : rowIdx));
  const { getMeasuredHeight, renderWindowRef } = useMeasuredRowHeights({
    gridRef,
    rows,
    rowHeight,
    // Only estimated heights can be wrong; a fixed height is exact, and without virtualization every row is rendered
    enabled: enableRowVirtualization && typeof rowHeight === 'function',
    headerRowsCount,
    getRowKey: getMeasuredRowKey,
    // Not rowHeight or columns themselves: a consumer passing them inline would reset the cache on every render
    resetKeys: [renderedColumnWidths, isMobileBreakpoint, typeof baseRowHeight === 'number' ? baseRowHeight : null],
  });

  const groupedColumnHeaderRowsCount = headerRowsCount - 1;
  // Without a header row there is no header to navigate to.
  const minRowIdx = hideHeader ? 0 : -headerRowsCount;
  const mainHeaderRowIdx = groupedColumnHeaderRowsCount - headerRowsCount;
  const maxRowIdx = rows.length - 1;

  const [selectedPosition, setSelectedPosition] = useState((): SelectCellState | EditCellState<R> => ({
    idx: -1,
    rowIdx: minRowIdx - 1,
    mode: 'SELECT',
  }));

  // A selected row that moves, as a reorder grip steps it, takes the selection along, so Tab and the arrows continue from it
  const selectedRowRef = useRef<{ key: K; rows: readonly R[]; position: typeof selectedPosition } | null>(null);
  useLayoutEffect(() => {
    const getKey = typeof rowKeyGetter === 'function' ? rowKeyGetter : null;
    const row = rows[selectedPosition.rowIdx];
    const previous = selectedRowRef.current;
    const rowsChangedAlone = previous !== null && previous.rows !== rows && previous.position === selectedPosition;
    if (getKey && previous && rowsChangedAlone && selectedPosition.mode === 'SELECT' && (row === undefined || getKey(row) !== previous.key)) {
      const movedTo = rows.findIndex((candidate) => getKey(candidate) === previous.key);
      if (movedTo !== -1) {
        setSelectedPosition({ ...selectedPosition, rowIdx: movedTo });
        return;
      }
    }
    selectedRowRef.current = getKey && row !== undefined ? { key: getKey(row), rows, position: selectedPosition } : null;
  }, [rows, selectedPosition, rowKeyGetter]);

  // Blocks a double commit when both commitEditorChanges and the EditCell outside-click handler fire for one edit session.
  const editCommittedRef = useRef(false);

  // computed values
  const headerRowsHeight = headerRowsCount * headerRowHeight;
  const clientHeight = viewportHeight - headerRowsHeight;
  const isSelectable = effectiveSelectedRows != null && effectiveOnSelectedRowsChange != null;
  const { leftKey, rightKey } = getLeftRightKey();
  const ariaRowCount = rawAriaRowCount ?? headerRowsCount + rows.length;

  const headerSelectionValue = useMemo((): HeaderRowSelectionContextValue => {
    if (!isSelectable) {
      return { isRowSelected: false, isIndeterminate: false };
    }

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

    return { isRowSelected: hasSelectedRow && !hasUnselectedRow, isIndeterminate: hasSelectedRow && hasUnselectedRow };
  }, [rows, effectiveSelectedRows, rowKeyGetter, isSelectable]);

  const { rowOverscanStartIdx, rowOverscanEndIdx, totalRowHeight, gridTemplateRows, getRowTop, getRowHeight, getRowEstimate, findRowIdx } =
    useViewportRows({
      rows,
      rowHeight,
      clientHeight,
      scrollTop,
      enableVirtualization: enableRowVirtualization,
      measured,
      getMeasuredHeight,
    });

  useLayoutEffect(() => {
    renderWindowRef.current = [rowOverscanStartIdx, rowOverscanEndIdx];
  });

  const {
    gridTemplateColumns,
    handleColumnResize,
    handleColumnResizeEnd: handleColumnResizeEndWidths,
  } = useColumnWidths(columns, templateColumns, gridRef, columnWidths, onColumnWidthsChange, onColumnResize, setColumnResizing);

  const maxColIdx = columns.length - 1;

  // utils
  function isColIdxWithinSelectionBounds(idx: number) {
    return idx >= 0 && idx <= maxColIdx;
  }

  function isRowIdxWithinViewportBounds(rowIdx: number) {
    return rowIdx >= 0 && rowIdx < rows.length;
  }

  function isCellWithinSelectionBounds({ idx, rowIdx }: Position): boolean {
    return rowIdx >= minRowIdx && rowIdx <= maxRowIdx && isColIdxWithinSelectionBounds(idx);
  }

  function isCellWithinViewportBounds({ idx, rowIdx }: Position): boolean {
    return isRowIdxWithinViewportBounds(rowIdx) && isColIdxWithinSelectionBounds(idx);
  }

  function isCellEditable(position: Position): boolean {
    return isCellWithinViewportBounds(position) && isSelectedCellEditable({ columns, rows, selectedPosition: position });
  }

  const selectedCellIsWithinSelectionBounds = isCellWithinSelectionBounds(selectedPosition);
  const selectedCellIsWithinViewportBounds = isCellWithinViewportBounds(selectedPosition);

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
    const anchorIdx =
      isShiftClick && selectionAnchorKey !== null ? rows.findIndex((candidate) => rowKeyGetter(candidate) === selectionAnchorKey) : -1;
    setSelectionAnchorKey(rowKey);

    if (checked) {
      newSelectedRows.add(rowKey);
    } else {
      newSelectedRows.delete(rowKey);
    }

    if (anchorIdx !== -1 && anchorIdx !== rowIdx) {
      const step = sign(rowIdx - anchorIdx);
      for (let i = anchorIdx + step; i !== rowIdx; i += step) {
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

  function updateRow(column: CalculatedColumn<R, SR>, rowIdx: number, row: R) {
    if (typeof onRowsChange !== 'function') return;
    if (row === rows[rowIdx]) return;
    const updatedRows = rows.with(rowIdx, row);
    onRowsChange(updatedRows, { indexes: [rowIdx], column });
  }

  function commitEditorChanges() {
    if (selectedPosition.mode !== 'EDIT') return;
    if (editCommittedRef.current) return;
    editCommittedRef.current = true;
    updateRow(columns[selectedPosition.idx], selectedPosition.rowIdx, selectedPosition.row);
  }

  function selectCell(position: Position, options?: SelectCellOptions): void {
    if (!isCellWithinSelectionBounds(position)) return;
    commitEditorChanges();

    const samePosition = isSamePosition(selectedPosition, position);

    if (options?.enableEditor && isCellEditable(position)) {
      const row = rows[position.rowIdx];
      setSelectedPosition({ ...position, mode: 'EDIT', row, originalRow: row });
    } else if (samePosition) {
      // Scroll only for explicit keyboard or programmatic focus: mouse-selected cells are already visible.
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
  }

  function selectHeaderCell({ idx, rowIdx }: Position): void {
    selectCell({ rowIdx: minRowIdx + rowIdx - 1, idx });
  }

  // Stable wrapper identity, so memoized children are not invalidated.
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

  // effects
  useLayoutEffect(() => {
    if (!shouldFocusCellRef.current) return;
    shouldFocusCellRef.current = false;
    const shouldScroll = !skipScrollOnFocusRef.current;
    skipScrollOnFocusRef.current = false;
    focusCell(shouldScroll);
    // `selectedPosition.mode` is a dep so an EDIT to SELECT transition on the same cell still refocuses it.
  }, [focusCell, selectedPosition.idx, selectedPosition.rowIdx, selectedPosition.mode]);

  // Resets the commit guard after render, once the old EditCell has unmounted and dropped its outside-click handler.
  useEffect(() => {
    if (selectedPosition.mode === 'EDIT') {
      editCommittedRef.current = false;
    }
  }, [selectedPosition.mode]);

  useNearEnd({ totalRows: rows.length, rowOverscanEndIdx, measured, onNearEndChange, threshold: rawNearEndThreshold });

  // event handlers
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const { idx, rowIdx, mode } = selectedPosition;
    if (mode === 'EDIT') return;

    if (onCellKeyDown && isRowIdxWithinViewportBounds(rowIdx)) {
      const row = rows[rowIdx];
      const cellEvent = createCellEvent(event);
      onCellKeyDown({ mode: 'SELECT', row, column: columns[idx], rowIdx, selectCell }, cellEvent);
      if (cellEvent.isGridDefaultPrevented()) return;
    }

    if (!(event.target instanceof Element)) return;
    if (event.target.closest('.rdg-cell') === null) return;

    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
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

  function handleCellCopy(event: CellClipboardEvent) {
    if (!selectedCellIsWithinViewportBounds) return;
    // Text the user selected is what they mean to copy.
    if (window.getSelection()?.isCollapsed === false) return;

    const { idx, rowIdx } = selectedPosition;
    const column = columns[idx];
    const row = rows[rowIdx];
    const value = row[column.key as keyof R];
    onCellCopy?.({ row, column, rowIdx, value }, event);

    if (event.defaultPrevented) return;
    // A column whose key names no row field copies what it renders.
    const text = cellValueToText(value) || (event.target instanceof Element ? event.target.closest('.rdg-cell')?.textContent : '');
    if (!text) return;
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
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

    if (isSelectable && shiftKey && key === ' ') {
      assertIsValidKeyGetter<R, K>(rowKeyGetter);
      const rowKey = rowKeyGetter(row);
      selectRow({ row, checked: !effectiveSelectedRows.has(rowKey), isShiftClick: false });
      event.preventDefault();
      return;
    }

    if (isCellEditable(selectedPosition) && isDefaultCellInput(event, onCellPaste != null)) {
      setSelectedPosition(({ idx, rowIdx }) => ({ idx, rowIdx, mode: 'EDIT', row, originalRow: row }));
    }
  }

  function handleColumnResizeEnd() {
    // Clear measured widths after resizing to restore flex sizing.
    handleColumnResizeEndWidths();
    // This check is needed as double click on the resize handle triggers onPointerMove
    if (isColumnResizing) {
      // Re-read columnWidths after cleanup; the hook already updated the map
      onColumnWidthsChangeRaw?.(columnWidthsInternal);
      setColumnResizing(false);
    }
  }

  function getNextPosition(key: string, ctrlKey: boolean, shiftKey: boolean): Position {
    const { idx, rowIdx } = selectedPosition;

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
        return { idx: 0, rowIdx: ctrlKey ? minRowIdx : rowIdx };
      case 'End':
        return { idx: maxColIdx, rowIdx: ctrlKey ? maxRowIdx : rowIdx };
      case 'PageUp': {
        // Header rows sit above the rows, so there is nothing to page up to.
        if (rowIdx < 0) return selectedPosition;
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
    // Tab arrives only from an open editor, to commit and move on; a selected cell lets it leave the grid.
    if (key === 'Tab') {
      if (canExitGrid({ shiftKey, maxColIdx, minRowIdx, maxRowIdx, selectedPosition })) {
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

    selectCell(nextSelectedCellPosition, { shouldFocusCell: true });
  }

  function getCellEditor(rowIdx: number) {
    if (!isCellWithinViewportBounds(selectedPosition) || selectedPosition.rowIdx !== rowIdx || selectedPosition.mode === 'SELECT') {
      return;
    }

    const { idx, row } = selectedPosition;
    const column = columns[idx];
    const colSpan = getColSpan(column, lastFrozenColumnIndex, { type: 'ROW', row });
    const closeOnExternalRowChange = column.editorOptions?.closeOnExternalRowChange ?? true;

    const closeEditor = (shouldFocusCell: boolean) => {
      shouldFocusCellRef.current = shouldFocusCell;
      // The edited cell did not move, so refocus without applying its sticky-header scroll margin.
      skipScrollOnFocusRef.current = true;
      setSelectedPosition(({ idx, rowIdx }) => ({ idx, rowIdx, mode: 'SELECT' }));
    };

    const onRowChange = (row: R, commitChanges: boolean, shouldFocusCell: boolean) => {
      if (commitChanges) {
        // commitEditorChanges may have committed this edit already on click; a second pass would fire onRowsChange twice.
        if (editCommittedRef.current) return;
        editCommittedRef.current = true;
        // Flushing the update and the close together keeps re-entrant commits from firing `onRowChange` twice.
        flushSync(() => {
          updateRow(column, selectedPosition.rowIdx, row);
          closeEditor(shouldFocusCell);
        });
      } else {
        setSelectedPosition((position) => ({ ...position, row }));
      }
    };

    if (closeOnExternalRowChange && rows[selectedPosition.rowIdx] !== selectedPosition.originalRow) {
      // Discard changes if rows are updated from outside. This runs during render, so it skips the focus refs closeEditor writes.
      setSelectedPosition(({ idx, rowIdx }) => ({ idx, rowIdx, mode: 'SELECT' }));
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

    const startRowIdx = selectedCellIsWithinViewportBounds && selectedRowIdx < rowOverscanStartIdx ? rowOverscanStartIdx - 1 : rowOverscanStartIdx;
    const endRowIdx = selectedCellIsWithinViewportBounds && selectedRowIdx > rowOverscanEndIdx ? rowOverscanEndIdx + 1 : rowOverscanEndIdx;

    for (let viewportRowIdx = startRowIdx; viewportRowIdx <= endRowIdx; viewportRowIdx++) {
      const isRowOutsideViewport = viewportRowIdx === rowOverscanStartIdx - 1 || viewportRowIdx === rowOverscanEndIdx + 1;
      const rowIdx = isRowOutsideViewport ? selectedRowIdx : viewportRowIdx;

      let rowColumns = columns;
      const selectedColumn = selectedIdx === -1 ? undefined : columns[selectedIdx];
      if (selectedColumn !== undefined) {
        if (isRowOutsideViewport) {
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
          rowClass,
          animateReorder,
          gridRowStart,
          // The estimate, not the measured height: a cell sized from --rdg-row-height would otherwise hold the row at its tallest
          height: getRowEstimate(rowIdx),
          selectedCellIdx: selectedRowIdx === rowIdx ? selectedIdx : undefined,
          lastFrozenColumnIndex,
          onRowChange: handleFormatterRowChangeLatest,
          selectCell: selectCellLatest,
          selectedCellEditor: getCellEditor(rowIdx),
          renderCell,
        }),
      );
    }

    return rowElements;
  }

  // Reset the positions if the current values are invalid after a column or row is removed.
  if (selectedPosition.idx > maxColIdx || selectedPosition.rowIdx > maxRowIdx) {
    setSelectedPosition({ idx: -1, rowIdx: minRowIdx - 1, mode: 'SELECT' });
  }

  // The grid's tab stop sits on the first header cell; without a header row it needs a cell of the first row.
  const firstFocusableIdx = hideHeader && rows.length > 0 && selectedPosition.rowIdx < 0 ? columns.findIndex((column) => column.focusable) : -1;
  if (firstFocusableIdx !== -1) {
    setSelectedPosition({ idx: firstFocusableIdx, rowIdx: 0, mode: 'SELECT' });
  }

  if (isColumnWidthsControlled && columnWidthsInternal !== columnWidthsRaw) {
    setColumnWidthsInternal(columnWidthsRaw);
  }

  let templateRows = `repeat(${headerRowsCount}, ${headerRowHeight}px)`;
  if (rows.length > 0) {
    templateRows += gridTemplateRows;
  }

  return (
    <div
      role="grid"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-description={ariaDescription}
      aria-describedby={ariaDescribedBy}
      aria-multiselectable={isSelectable ? true : undefined}
      aria-colcount={columns.length}
      aria-rowcount={ariaRowCount}
      // Explicit tabIndex makes the scrollable container keyboard focusable the same way in Chrome and Firefox.
      tabIndex={-1}
      className={cn(
        // Tabular digits keep numeric columns aligned across rows.
        'rdg grid h-full overflow-x-auto text-foreground text-sm tabular-nums accent-primary [contain:style]',
        className,
      )}
      style={{
        // set scrollPadding to correctly position non-sticky cells after scrolling
        scrollPaddingInlineStart: selectedPosition.idx > lastFrozenColumnIndex ? `${totalFrozenColumnWidth}px` : undefined,
        scrollPaddingBlock: isRowIdxWithinViewportBounds(selectedPosition.rowIdx) ? `${headerRowsHeight}px` : undefined,
        gridTemplateColumns,
        gridTemplateRows: templateRows,
        '--rdg-header-row-height': `${headerRowHeight}px`,
        ...layoutCssVars,
      }}
      dir="ltr"
      ref={gridRef}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      onCopy={handleCellCopy}
      onPaste={handleCellPaste}
      data-testid={testId}
      data-cy={dataCy}
      data-is-compact={isCompact || undefined}
      // Tile mode: mobile breakpoint with at least one merged host column
      data-tiled={(activeModes.mobile && columns.some((column) => column.mergedSlots != null)) || undefined}
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
              shouldFocusGrid={!selectedCellIsWithinSelectionBounds}
            />
          </HeaderRowSelectionContext>
        </HeaderRowSelectionChangeContext>
      )}
      {rows.length === 0 && noRowsFallback ? (
        noRowsFallback
      ) : (
        <RowSelectionChangeContext value={selectRowLatest}>{getViewportRows()}</RowSelectionChangeContext>
      )}

      {/* single-column cells so column widths stay measurable regardless of colSpan */}
      {renderMeasuringCells(columns)}
    </div>
  );
}

function getCellToScroll(gridEl: HTMLDivElement) {
  return gridEl.querySelector<HTMLDivElement>(':scope > [role="row"] > [tabindex="0"]');
}

function isSamePosition(p1: Position, p2: Position) {
  return p1.idx === p2.idx && p1.rowIdx === p2.rowIdx;
}
