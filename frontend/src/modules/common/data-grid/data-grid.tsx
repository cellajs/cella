import type { Key, KeyboardEvent } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useCurrentBreakpoint } from '~/hooks/use-breakpoints';
import { useLatestCallback } from '~/hooks/use-latest-ref';
import { defaultRenderCell } from './cell';
import { EditCell } from './edit-cell';
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
  CellMouseEventHandler,
  CellNavigationMode,
  CellRendererProps,
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
  TreeRowAttributes,
} from './types';
import {
  canExitGrid,
  cellValueToText,
  cn,
  computeMergedSlotExtraHeight,
  computeWrapTextRowHeight,
  getNextSelectedCellPosition,
  hasWrapTextColumns,
  isCellEditableUtil,
  isCtrlKeyHeldDown,
  isDefaultCellInput,
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
  rowKeyGetter: (row: NoInfer<R>) => K;
  onRowsChange?: Maybe<(rows: NoInfer<R>[], data: RowsChangeData<NoInfer<R>, NoInfer<SR>>) => void>;

  // Dimensions
  /** In px */
  rowHeight?: Maybe<number | ((row: NoInfer<R>) => number)>;
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
  onCellClick?: CellMouseEventHandler<R, SR>;
  onScroll?: Maybe<(event: React.UIEvent<HTMLDivElement>) => void>;
  /** Enable handle-column row reordering with per-row drop targets and indicators. */
  onRowReorder?: Maybe<(fromIdx: number, toIdx: number, edge: 'top' | 'bottom') => void>;
  /** When provided, the middle 50% of each row becomes a "reparent" drop zone for tree-structured data. */
  onRowReparent?: Maybe<(fromIdx: number, toIdx: number) => void>;
  /** Checked on every drag move, falling back to the nearest allowed zone; no allowed zone suppresses the indicator and drop callback. */
  canDropRow?: Maybe<(args: { fromIdx: number; toIdx: number; zone: 'top' | 'bottom' | 'center' }) => boolean>;
  /** Content rendered inside the native drag preview. Defaults to a generic preview. */
  renderRowDragPreview?: Maybe<(row: NoInfer<R>) => React.ReactNode>;

  // Toggles and modes
  enableVirtualization?: Maybe<boolean>;
  /** Pins header rows below the sticky stack while a window-scrolled grid passes the viewport top; never below `sm` */
  enableStickyHeader?: Maybe<boolean>;
  /** Vertical auto-scroll of the viewport during a row drag */
  enableDragAutoScroll?: Maybe<boolean>;

  // Infinite scroll
  /** Level-triggered near-end state, reported as false on exit and on unmount. */
  onNearEndChange?: Maybe<(nearEnd: boolean) => void>;
  /** Rows from the end at which onNearEndChange reports true; defaults to 25% of rows, between 10 and 50 */
  nearEndThreshold?: Maybe<number>;

  // Miscellaneous
  renderers?: Maybe<Renderers<NoInfer<R>, NoInfer<SR>>>;
  rowClass?: Maybe<(row: NoInfer<R>, rowIdx: number) => Maybe<string>>;
  /** Rows that form a tree: the grid is a treegrid, and each row takes the attributes this returns for its index. */
  treeRow?: Maybe<(rowIdx: number) => TreeRowAttributes>;
  /** Enable compact column overrides and the root data-is-compact attribute. */
  isCompact?: Maybe<boolean>;
  hideHeader?: Maybe<boolean>;
  'data-testid'?: Maybe<string>;
  'data-cy'?: Maybe<string>;
}

const emptyColumnWidths: ReadonlyMap<string, number> = new Map();

/** The header row's index in a selected position; rows count from 0. */
const headerRowIdx = -1;

const navigationKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

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
    columnWidths: columnWidthsRaw,
    onColumnWidthsChange: onColumnWidthsChangeRaw,
    selectedRows,
    isRowSelectionDisabled,
    onSelectedRowsChange,
    sortColumns,
    onSortColumnsChange,
    defaultColumnOptions,
    onCellClick,
    onScroll,
    onRowReorder,
    onRowReparent,
    canDropRow,
    renderRowDragPreview,
    enableVirtualization: rawEnableVirtualization,
    enableStickyHeader: rawEnableStickyHeader,
    enableDragAutoScroll: rawEnableDragAutoScroll,
    onNearEndChange,
    nearEndThreshold: rawNearEndThreshold,
    renderers,
    className,
    rowClass,
    treeRow,
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

  const baseRowHeight = rawRowHeight ?? 35;
  const headerRowHeight = hideHeader ? 0 : typeof baseRowHeight === 'number' ? baseRowHeight : 35;
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
  const rowDragConfig: RowDragConfig<R> | null = rowDragEnabled
    ? {
        onRowReorder: onRowReorderLatest,
        onRowReparent: reparentEnabled ? onRowReparentLatest : undefined,
        canDropRow: canDropRowEnabled ? canDropRowLatest : undefined,
        renderRowDragPreview: dragPreviewEnabled ? renderRowDragPreviewLatest : undefined,
      }
    : null;
  // Row DnD: handle cells become drag sources and each row box becomes one drop target.
  const renderCell = rowDragConfig
    ? (key: Key, props: CellRendererProps<R, SR>) =>
        props.column.rowDragHandle === true ? <RowDragCell<R, SR> key={key} {...props} config={rowDragConfig} /> : userRenderCell(key, props)
    : userRenderCell;
  const renderRow = rowDragConfig
    ? (key: Key, props: RenderRowProps<R, SR>) => (
        <RowDropTarget<R, SR> key={key} rowKey={key} {...props} config={rowDragConfig} renderRow={userRenderRow} />
      )
    : userRenderRow;
  const noRowsFallback = renderers?.noRowsFallback;
  const enableVirtualization = rawEnableVirtualization ?? true;
  const enableDragAutoScroll = rawEnableDragAutoScroll ?? false;

  const currentBreakpoint = useCurrentBreakpoint();

  // 'compact' is the density toggle, 'mobile' is the xs breakpoint; columns key `modes` overrides off both.
  const isMobileBreakpoint = currentBreakpoint === 'xs';
  const activeModes: ActiveModes = { compact: isCompact ?? false, mobile: isMobileBreakpoint };

  // Disable row selection on the smallest breakpoint (xs) where checkboxes are hidden
  const effectiveSelectedRows = isMobileBreakpoint ? undefined : selectedRows;
  const effectiveOnSelectedRowsChange = isMobileBreakpoint ? undefined : onSelectedRowsChange;

  // On the smallest breakpoint (xs) the header is not pinned by default: it takes a row of a short screen. An explicit value wins.
  const enableStickyHeader = (rawEnableStickyHeader ?? true) && !isMobileBreakpoint && !hideHeader;

  const [columnWidthsInternal, setColumnWidthsInternal] = useState((): ColumnWidths => columnWidthsRaw ?? new Map());
  const shouldFocusCellRef = useRef(false);
  // Skip scrolling when an editor closes onto the same cell: its sticky-header margin jumps the page near viewport edges.
  const skipScrollOnFocusRef = useRef(false);
  // The row a Shift-click extends from, by key: its index changes when the rows sort or filter.
  const [selectionAnchorKey, setSelectionAnchorKey] = useState<K | null>(null);

  const isColumnWidthsControlled = columnWidthsRaw != null && onColumnWidthsChangeRaw != null;
  const columnWidths = isColumnWidthsControlled ? columnWidthsRaw : columnWidthsInternal;
  const onColumnWidthsChange = isColumnWidthsControlled ? onColumnWidthsChangeRaw : setColumnWidthsInternal;

  const getColumnWidth = (column: CalculatedColumn<R, SR>) => columnWidths.get(column.key) ?? column.width;

  const { gridRef, viewportHeight, scrollTop, measured } = useGridDimensions(undefined, enableVirtualization);

  const { columns, templateColumns } = useCalculatedColumns({ rawColumns, defaultColumnOptions, getColumnWidth, currentBreakpoint, activeModes });

  // Motion-animated reorder needs every row mounted: virtualized rows unmount mid-scroll and break FLIP.
  const animateReorder = rowDragEnabled && !enableVirtualization;

  useStickyHeader(gridRef, headerRowHeight, enableStickyHeader);

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
    if (!hasWrapTextColumns(columns)) return slotExtra === 0 ? scaledBase : () => scaledBase + slotExtra;
    const getRenderedWidth = (column: CalculatedColumn<R, unknown>) =>
      renderedColumnWidths.get(column.key) ?? (typeof column.width === 'number' ? column.width : column.minWidth);
    const wrapColumns = columns as readonly CalculatedColumn<R, unknown>[];
    return (row: R) => computeWrapTextRowHeight(scaledBase, wrapColumns, row, getRenderedWidth) + slotExtra;
  }, [baseRowHeight, columns, isMobileBreakpoint, renderedColumnWidths]);

  const { getMeasuredHeight, renderWindowRef } = useMeasuredRowHeights({
    gridRef,
    rows,
    rowHeight,
    // Only estimated heights can be wrong; a fixed height is exact, and without virtualization every row is rendered
    enabled: enableVirtualization && typeof rowHeight === 'function',
    getRowKey: rowKeyGetter,
    // Not rowHeight or columns themselves: a consumer passing them inline would reset the cache on every render
    resetKeys: [renderedColumnWidths, isMobileBreakpoint, typeof baseRowHeight === 'number' ? baseRowHeight : null],
  });

  // Without a header row there is no header to navigate to.
  const minRowIdx = hideHeader ? 0 : headerRowIdx;
  const maxRowIdx = rows.length - 1;

  const [selectedPosition, setSelectedPosition] = useState((): SelectCellState | EditCellState<R> => ({
    idx: -1,
    rowIdx: minRowIdx - 1,
    mode: 'SELECT',
  }));

  // A selected row that moves, as a reorder grip steps it, takes the selection along, so Tab and the arrows continue from it
  const selectedRowRef = useRef<{ key: K; rows: readonly R[]; position: typeof selectedPosition } | null>(null);
  useLayoutEffect(() => {
    const row = rows[selectedPosition.rowIdx];
    const previous = selectedRowRef.current;
    const rowsChangedAlone = previous !== null && previous.rows !== rows && previous.position === selectedPosition;
    if (previous && rowsChangedAlone && selectedPosition.mode === 'SELECT' && (row === undefined || rowKeyGetter(row) !== previous.key)) {
      const movedTo = rows.findIndex((candidate) => rowKeyGetter(candidate) === previous.key);
      if (movedTo !== -1) {
        setSelectedPosition({ ...selectedPosition, rowIdx: movedTo });
        return;
      }
    }
    selectedRowRef.current = row !== undefined ? { key: rowKeyGetter(row), rows, position: selectedPosition } : null;
  }, [rows, selectedPosition, rowKeyGetter]);

  // Blocks a double commit when both commitEditorChanges and the EditCell outside-click handler fire for one edit session.
  const editCommittedRef = useRef(false);

  const clientHeight = viewportHeight - headerRowHeight;
  const isSelectable = effectiveSelectedRows != null && effectiveOnSelectedRowsChange != null;
  const ariaRowCount = rawAriaRowCount ?? rows.length + 1;

  const headerSelectionValue = useMemo((): HeaderRowSelectionContextValue => {
    if (!isSelectable) return { isRowSelected: false, isIndeterminate: false };

    let hasSelectedRow = false;
    let hasUnselectedRow = false;
    if (effectiveSelectedRows.size > 0) {
      for (const row of rows) {
        if (effectiveSelectedRows.has(rowKeyGetter(row))) hasSelectedRow = true;
        else hasUnselectedRow = true;
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
      enableVirtualization,
      measured,
      getMeasuredHeight,
    });

  useLayoutEffect(() => {
    renderWindowRef.current = [rowOverscanStartIdx, rowOverscanEndIdx];
  });

  const { gridTemplateColumns, handleColumnResize, handleColumnResizeEnd } = useColumnWidths(
    columns,
    templateColumns,
    gridRef,
    columnWidths,
    onColumnWidthsChange,
  );

  const maxColIdx = columns.length - 1;

  const isColIdxWithinSelectionBounds = (idx: number) => idx >= 0 && idx <= maxColIdx;
  const isRowIdxWithinViewportBounds = (rowIdx: number) => rowIdx >= 0 && rowIdx < rows.length;
  const isCellWithinSelectionBounds = ({ idx, rowIdx }: Position) => rowIdx >= minRowIdx && rowIdx <= maxRowIdx && isColIdxWithinSelectionBounds(idx);
  const isCellWithinViewportBounds = ({ idx, rowIdx }: Position) => isRowIdxWithinViewportBounds(rowIdx) && isColIdxWithinSelectionBounds(idx);
  const isCellEditable = (position: Position) =>
    isCellWithinViewportBounds(position) && isCellEditableUtil(columns[position.idx], rows[position.rowIdx]);

  const selectedCellIsWithinSelectionBounds = isCellWithinSelectionBounds(selectedPosition);
  const selectedCellIsWithinViewportBounds = isCellWithinViewportBounds(selectedPosition);

  function selectHeaderRow(args: SelectHeaderRowEvent) {
    if (!effectiveOnSelectedRowsChange) return;

    const newSelectedRows = new Set(effectiveSelectedRows);
    for (const row of rows) {
      if (isRowSelectionDisabled?.(row) === true) continue;
      const rowKey = rowKeyGetter(row);
      if (args.checked) newSelectedRows.add(rowKey);
      else newSelectedRows.delete(rowKey);
    }
    effectiveOnSelectedRowsChange(newSelectedRows);
  }

  function selectRow(args: SelectRowEvent<R>) {
    if (!effectiveOnSelectedRowsChange) return;

    const { row, checked, isShiftClick } = args;
    if (isRowSelectionDisabled?.(row) === true) return;

    const newSelectedRows = new Set(effectiveSelectedRows);
    const rowKey = rowKeyGetter(row);
    const rowIdx = rows.indexOf(row);
    const anchorIdx =
      isShiftClick && selectionAnchorKey !== null ? rows.findIndex((candidate) => rowKeyGetter(candidate) === selectionAnchorKey) : -1;
    setSelectionAnchorKey(rowKey);

    if (checked) newSelectedRows.add(rowKey);
    else newSelectedRows.delete(rowKey);

    if (anchorIdx !== -1 && anchorIdx !== rowIdx) {
      const step = sign(rowIdx - anchorIdx);
      for (let i = anchorIdx + step; i !== rowIdx; i += step) {
        const row = rows[i];
        if (isRowSelectionDisabled?.(row) === true) continue;
        if (checked) newSelectedRows.add(rowKeyGetter(row));
        else newSelectedRows.delete(rowKeyGetter(row));
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
      if (options?.shouldFocusCell === true) scrollIntoView(getCellToScroll(gridRef.current!));
    } else {
      shouldFocusCellRef.current = options?.shouldFocusCell === true;
      setSelectedPosition({ ...position, mode: 'SELECT' });
    }
  }

  function selectHeaderCell(idx: number): void {
    selectCell({ rowIdx: headerRowIdx, idx });
  }

  // Stable wrapper identity, so memoized children are not invalidated.
  const handleColumnResizeLatest = useLatestCallback(handleColumnResize);
  const handleColumnResizeEndLatest = useLatestCallback(handleColumnResizeEnd);
  const onSortColumnsChangeLatest = useLatestCallback(onSortColumnsChange);
  const onCellClickLatest = useLatestCallback(onCellClick);
  const selectHeaderRowLatest = useLatestCallback(selectHeaderRow);
  const selectRowLatest = useLatestCallback(selectRow);
  const handleFormatterRowChangeLatest = useLatestCallback(updateRow);
  const selectCellLatest = useLatestCallback(selectCell);
  const selectHeaderCellLatest = useLatestCallback(selectHeaderCell);

  const focusCell = (shouldScroll = true) => {
    const cell = getCellToScroll(gridRef.current!);
    if (cell === null) return;
    if (shouldScroll) scrollIntoView(cell);
    cell.focus({ preventScroll: true });
  };

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
    if (selectedPosition.mode === 'EDIT') editCommittedRef.current = false;
  }, [selectedPosition.mode]);

  useNearEnd({ totalRows: rows.length, rowOverscanEndIdx, measured, onNearEndChange, threshold: rawNearEndThreshold });

  function handleCellCopy(event: React.ClipboardEvent<HTMLDivElement>) {
    if (!selectedCellIsWithinViewportBounds) return;
    // Text the user selected is what they mean to copy.
    if (window.getSelection()?.isCollapsed === false) return;

    const { idx, rowIdx } = selectedPosition;
    const column = columns[idx];
    const row = rows[rowIdx];
    const value = row[column.key as keyof R];
    // A column whose key names no row field copies what it renders.
    const text = cellValueToText(value) || (event.target instanceof Element ? event.target.closest('.rdg-cell')?.textContent : '');
    if (!text) return;
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
  }

  function handleCellInput(event: KeyboardEvent<HTMLDivElement>) {
    if (!selectedCellIsWithinViewportBounds) return;
    const row = rows[selectedPosition.rowIdx];
    const { key, shiftKey } = event;

    if (isSelectable && shiftKey && key === ' ') {
      const rowKey = rowKeyGetter(row);
      selectRow({ row, checked: !effectiveSelectedRows.has(rowKey), isShiftClick: false });
      event.preventDefault();
      return;
    }

    if (isCellEditable(selectedPosition) && isDefaultCellInput(event)) {
      setSelectedPosition(({ idx, rowIdx }) => ({ idx, rowIdx, mode: 'EDIT', row, originalRow: row }));
    }
  }

  function getNextPosition(key: string, ctrlKey: boolean, shiftKey: boolean): Position {
    const { idx, rowIdx } = selectedPosition;

    switch (key) {
      case 'ArrowUp':
        return { idx, rowIdx: rowIdx - 1 };
      case 'ArrowDown':
        return { idx, rowIdx: rowIdx + 1 };
      case 'ArrowLeft':
        return { idx: idx - 1, rowIdx };
      case 'ArrowRight':
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
      moveNext: key === 'ArrowRight' || (key === 'Tab' && !shiftKey),
      columns,
      minRowIdx,
      maxRowIdx,
      cellNavigationMode,
      currentPosition: selectedPosition,
      nextPosition,
    });

    selectCell(nextSelectedCellPosition, { shouldFocusCell: true });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (selectedPosition.mode === 'EDIT') return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('.rdg-cell') === null) return;
    if (navigationKeys.has(event.key)) navigate(event);
    else handleCellInput(event);
  }

  function getCellEditor(rowIdx: number) {
    const isEditingRow = selectedPosition.mode === 'EDIT' && selectedPosition.rowIdx === rowIdx;
    if (!isEditingRow || !isCellWithinViewportBounds(selectedPosition)) return;

    const { idx, row } = selectedPosition;
    const column = columns[idx];

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

    return (
      <EditCell key={column.key} column={column} row={row} rowIdx={rowIdx} onRowChange={onRowChange} closeEditor={closeEditor} navigate={navigate} />
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

      const selectedColumn = selectedIdx === -1 ? undefined : columns[selectedIdx];
      const rowColumns = isRowOutsideViewport && selectedColumn !== undefined ? [selectedColumn] : columns;

      const row = rows[rowIdx];
      const key = rowKeyGetter(row);
      const isRowSelected = effectiveSelectedRows?.has(key) ?? false;
      // 1 based, after the header row
      const gridRowStart = rowIdx + 2;

      rowElements.push(
        renderRow(key, {
          'aria-rowindex': gridRowStart,
          ...treeRow?.(rowIdx),
          'aria-selected': isSelectable ? isRowSelected : undefined,
          rowIdx,
          row,
          viewportColumns: rowColumns,
          isRowSelectionDisabled: isRowSelectionDisabled?.(row) ?? false,
          isRowSelected,
          onCellClick: onCellClickLatest,
          rowClass,
          animateReorder,
          gridRowStart,
          // The estimate, not the measured height: a cell sized from --rdg-row-height would otherwise hold the row at its tallest
          height: getRowEstimate(rowIdx),
          selectedCellIdx: selectedRowIdx === rowIdx ? selectedIdx : undefined,
          onRowChange: handleFormatterRowChangeLatest,
          selectCell: selectCellLatest,
          selectedCellEditor: getCellEditor(rowIdx),
          renderCell,
        }),
      );
    }

    return rowElements;
  }

  if (selectedPosition.mode === 'EDIT' && rows[selectedPosition.rowIdx] !== selectedPosition.originalRow) {
    // The editor follows its row's key when rows arrive or leave above it; any other outside change to the row discards the edit.
    const originalKey = rowKeyGetter(selectedPosition.originalRow);
    const movedTo = rows.findIndex((candidate) => rowKeyGetter(candidate) === originalKey);
    if (movedTo !== -1 && movedTo !== selectedPosition.rowIdx) setSelectedPosition({ ...selectedPosition, rowIdx: movedTo });
    else setSelectedPosition(({ idx, rowIdx }) => ({ idx, rowIdx, mode: 'SELECT' }));
  } else if (selectedPosition.idx > maxColIdx || selectedPosition.rowIdx > maxRowIdx) {
    // Reset the positions if the current values are invalid after a column or row is removed.
    setSelectedPosition({ idx: -1, rowIdx: minRowIdx - 1, mode: 'SELECT' });
  }

  // The grid's tab stop sits on the first header cell; without a header row it needs a cell of the first row.
  const firstFocusableIdx = hideHeader && rows.length > 0 && selectedPosition.rowIdx < 0 ? columns.findIndex((column) => column.focusable) : -1;
  if (firstFocusableIdx !== -1) setSelectedPosition({ idx: firstFocusableIdx, rowIdx: 0, mode: 'SELECT' });

  const templateRows = `${headerRowHeight}px${rows.length > 0 ? gridTemplateRows : ''}`;

  return (
    <div
      role={treeRow ? 'treegrid' : 'grid'}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-description={ariaDescription}
      aria-describedby={ariaDescribedBy}
      aria-multiselectable={isSelectable ? true : undefined}
      aria-colcount={columns.length}
      aria-rowcount={ariaRowCount}
      // Explicit tabIndex makes the scrollable container keyboard focusable the same way in Chrome and Firefox.
      tabIndex={-1}
      className={cn('rdg text-foreground accent-primary grid h-full overflow-x-auto text-sm tabular-nums [contain:style]', className)}
      style={{
        // set scrollPadding to correctly position non-sticky cells after scrolling
        scrollPaddingBlock: isRowIdxWithinViewportBounds(selectedPosition.rowIdx) ? `${headerRowHeight}px` : undefined,
        gridTemplateColumns,
        gridTemplateRows: templateRows,
        '--rdg-header-row-height': `${headerRowHeight}px`,
      }}
      dir="ltr"
      ref={gridRef}
      onScroll={onScroll ?? undefined}
      onKeyDown={handleKeyDown}
      onCopy={handleCellCopy}
      data-testid={testId}
      data-cy={dataCy}
      data-is-compact={isCompact || undefined}
      data-tiled={(activeModes.mobile && columns.some((column) => column.mergedSlots != null)) || undefined}
    >
      {!hideHeader && (
        <HeaderRowSelectionChangeContext value={selectHeaderRowLatest}>
          <HeaderRowSelectionContext value={headerSelectionValue}>
            <HeaderRow
              columns={columns}
              onColumnResize={handleColumnResizeLatest}
              onColumnResizeEnd={handleColumnResizeEndLatest}
              sortColumns={sortColumns}
              onSortColumnsChange={onSortColumnsChangeLatest}
              selectedCellIdx={selectedPosition.rowIdx === headerRowIdx ? selectedPosition.idx : undefined}
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

      {/* One empty cell per column track, measured by resizing and wrapped-row estimates */}
      {renderMeasuringCells(columns)}
    </div>
  );
}

const getCellToScroll = (gridEl: HTMLDivElement) => gridEl.querySelector<HTMLDivElement>(':scope > [role="row"] > [tabindex="0"]');

const isSamePosition = (p1: Position, p2: Position) => p1.idx === p2.idx && p1.rowIdx === p2.rowIdx;
