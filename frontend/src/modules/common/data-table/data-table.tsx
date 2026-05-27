import { type Key, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type CellMouseArgs,
  type CellMouseEvent,
  type CellRendererProps,
  type CellSelectionMode,
  type ColumnWidths,
  DataGrid,
  type RenderRowProps,
  type RowSelectionMode,
  type RowsChangeData,
  type SortColumn,
} from '~/modules/common/data-grid';
import '~/modules/common/data-grid/style/data-grid.css';
import { useTranslation } from 'react-i18next';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { InfiniteLoader } from '~/modules/common/data-table/infinite-loader';
import { NoRows } from '~/modules/common/data-table/no-rows';
import { DataTableSkeleton } from '~/modules/common/data-table/table-skeleton';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useTableTooltip } from '~/modules/common/data-table/use-table-tooltip';
import { toaster } from '~/modules/common/toaster/toaster';
import { cn } from '~/utils/cn';

/** Maximum number of rows that can be selected at once */
const MAX_SELECTABLE_ROWS = 1000;

interface DataTableProps<TData> {
  columns: ColumnOrColumnGroup<TData>[];
  rows: TData[] | undefined;
  hasNextPage: boolean;
  rowKeyGetter: (row: TData) => string;
  error?: Error | null;
  isLoading?: boolean;
  isFetching?: boolean;
  limit?: number;
  isFiltered?: boolean;
  renderRow?: (key: Key, props: RenderRowProps<TData, unknown>) => ReactNode;
  renderCell?: (key: Key, props: CellRendererProps<TData, unknown>) => ReactNode;
  NoRowsComponent?: React.ReactNode;
  overflowNoRows?: boolean;
  onCellClick?: (args: CellMouseArgs<TData, unknown>, event: CellMouseEvent) => void;
  selectedRows?: Set<string>;
  onSelectedRowsChange?: (selectedRows: Set<string>) => void;
  sortColumns?: SortColumn[];
  onSortColumnsChange?: (sortColumns: SortColumn[]) => void;
  /** Cell selection mode (focus + range). @default 'cell' */
  cellSelectionMode?: CellSelectionMode;
  /** Row body click selection mode. Checkboxes always work as multi-select regardless. @default 'none' */
  rowSelectionMode?: RowSelectionMode;
  rowHeight?: number;
  hideHeader?: boolean;
  enableVirtualization?: boolean;
  /** Pin header rows to viewport top when grid scrolls out of view. @default false */
  enableStickyHeader?: boolean;
  /** Enable vertical auto-scroll of the grid viewport during pragmatic-dnd drag operations. @default false */
  enableDragAutoScroll?: boolean;
  /** Enable row drag-and-drop reorder. Mark a column with `rowDragHandle: true` to designate the drag source. */
  onRowReorder?: (fromIdx: number, toIdx: number, edge: 'top' | 'bottom') => void;
  /** Optional: enable drop-on-row for tree reparenting (adds a center 50% drop zone). */
  onRowReparent?: (fromIdx: number, toIdx: number) => void;
  /**
   * Optional per-zone drop validation. Use to enforce tree constraints
   * (max depth, cycle prevention) without coupling the grid to row shape.
   * Called on every drag move; must be fast.
   */
  canDropRow?: (args: { fromIdx: number; toIdx: number; zone: 'top' | 'bottom' | 'center' }) => boolean;
  /** Optional: render content inside the native drag preview while a row is dragged. */
  renderRowDragPreview?: (row: TData) => ReactNode;
  onRowsChange?: (rows: TData[], data: RowsChangeData<TData>) => void;
  fetchMore?: () => Promise<unknown>;
  className?: string;
  /** When true, hides infinite loader (for static/non-paginated tables) */
  readOnly?: boolean;
  /** Per-row function to disable selection (e.g. cross-tenant constraint) */
  isRowSelectionDisabled?: (row: TData) => boolean;
  /** Enable compact mode — applies column compact overrides and sets data-is-compact on the grid */
  isCompact?: boolean;
  /** When this value changes, internal column widths are reset (re-measured from column defaults). */
  resetWidthsKey?: string | number | boolean;
}

/**
 * Generic data table with support for loading state, error handling, no rows state,
 * sorting, selection, and infinite loading.
 */
export const DataTable = <TData,>({
  columns,
  rows,
  hasNextPage,
  rowKeyGetter,
  error,
  isLoading,
  isFetching,
  NoRowsComponent,
  isFiltered,
  selectedRows,
  onSelectedRowsChange,
  sortColumns,
  onSortColumnsChange,
  cellSelectionMode,
  rowSelectionMode,
  rowHeight = 52,
  hideHeader,
  enableVirtualization,
  enableStickyHeader,
  enableDragAutoScroll,
  onRowReorder,
  onRowReparent,
  canDropRow,
  renderRowDragPreview,
  onRowsChange,
  fetchMore,
  renderRow,
  renderCell,
  onCellClick,
  className,
  readOnly,
  isRowSelectionDisabled,
  isCompact,
  resetWidthsKey,
}: DataTableProps<TData>) => {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm', false);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(() => new Map());
  useTableTooltip(gridRef, !isLoading);

  // Reset column widths when resetWidthsKey changes (e.g., layout-affecting toggle)
  useEffect(() => {
    setColumnWidths(new Map());
  }, [resetWidthsKey]);

  // Handle infinite scroll - guards against multiple calls while fetching
  // Only use DataGrid's onRowsEndApproaching when virtualization is enabled;
  // otherwise, delegate to InfiniteLoader's intersection observer to avoid
  // cascading fetches (without virtualization, all rows are "visible").
  const handleRowsEndApproaching = enableVirtualization
    ? () => {
        if (!fetchMore || isFetching || !hasNextPage) return;
        fetchMore();
      }
    : undefined;

  // Wrap selection handler to enforce max selection limit. Memoized so the
  // identity stays stable across renders — `DataGrid` passes it through to
  // memoized rows; a fresh function each render would defeat that memo.
  const handleSelectedRowsChange = useCallback(
    (newSelectedRows: Set<string>) => {
      if (!onSelectedRowsChange) return;

      const currentSize = selectedRows?.size ?? 0;
      const newSize = newSelectedRows.size;

      // Check if trying to select more than the limit
      if (newSize > MAX_SELECTABLE_ROWS) {
        // If this is a "select all" attempt (large jump in selection)
        if (newSize - currentSize > 1) {
          toaster(t('c:selection_limit_all', { max: MAX_SELECTABLE_ROWS }), 'warning');
        } else {
          toaster(t('c:selection_limit', { max: MAX_SELECTABLE_ROWS }), 'warning');
        }
        return;
      }

      onSelectedRowsChange(newSelectedRows);
    },
    [onSelectedRowsChange, selectedRows, t],
  );

  // Stable `renderers` object: every fresh `{ renderRow, renderCell }` literal
  // would invalidate Row's memo and re-render every visible row on each parent
  // render. Re-create only when an actual renderer function identity changes.
  const renderers = useMemo(() => ({ renderRow, renderCell }), [renderRow, renderCell]);

  return (
    <div className={cn('mb-4 h-full w-full max-sm:-mx-3 max-sm:w-[calc(100%+1.5rem)] md:mb-8', className)}>
      {isLoading || !rows ? (
        // Render skeleton only on initial load
        <DataTableSkeleton
          cellsWidths={['3rem', '10rem', '4rem']}
          cellHeight={Number(rowHeight)}
          columnCount={columns.length}
        />
      ) : error && rows.length === 0 ? (
        <div className="flex h-full w-full flex-col items-center justify-center bg-background text-muted-foreground">
          <div className="my-8 text-center text-red-600 text-sm">{error.message}</div>
        </div>
      ) : !rows.length ? (
        <NoRows isFiltered={isFiltered} isFetching={isFetching} customComponent={NoRowsComponent} />
      ) : (
        <div className="relative grid" ref={gridRef}>
          <DataGrid
            rowHeight={isMobile ? rowHeight * 1.2 : rowHeight}
            enableVirtualization={enableVirtualization}
            enableStickyHeader={enableStickyHeader}
            enableDragAutoScroll={enableDragAutoScroll}
            rowKeyGetter={rowKeyGetter}
            columns={columns}
            onRowsChange={onRowsChange}
            rows={rows}
            onCellClick={onCellClick}
            selectedRows={selectedRows}
            onSelectedRowsChange={handleSelectedRowsChange}
            isRowSelectionDisabled={isRowSelectionDisabled}
            columnWidths={columnWidths}
            onColumnWidthsChange={setColumnWidths}
            sortColumns={sortColumns}
            onSortColumnsChange={onSortColumnsChange}
            onRowsEndApproaching={handleRowsEndApproaching}
            isCompact={isCompact}
            hideHeader={hideHeader}
            readOnly={readOnly}
            cellSelectionMode={cellSelectionMode ?? (readOnly ? 'none' : undefined)}
            rowSelectionMode={rowSelectionMode}
            onRowReorder={onRowReorder}
            onRowReparent={onRowReparent}
            canDropRow={canDropRow}
            renderRowDragPreview={renderRowDragPreview}
            renderers={renderers}
          />
          {!readOnly && (
            <InfiniteLoader
              hasNextPage={hasNextPage}
              isFetching={isFetching}
              isFetchMoreError={!!error}
              fetchMore={!enableVirtualization ? fetchMore : undefined}
            />
          )}
        </div>
      )}
    </div>
  );
};
