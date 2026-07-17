import { type Key, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type CellRendererProps,
  type CellSelectionMode,
  type ColumnWidths,
  DataGrid,
  type DataGridProps,
  type RenderRowProps,
} from '~/modules/common/data-grid';
import { InfiniteLoader } from '~/modules/common/data-table/infinite-loader';
import { NoRows } from '~/modules/common/data-table/no-rows';
import { DataTableSkeleton } from '~/modules/common/data-table/table-skeleton';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useFetchMoreOnDemand } from '~/modules/common/data-table/use-fetch-more-on-demand';
import { useTableTooltip } from '~/modules/common/data-table/use-table-tooltip';
import { toaster } from '~/modules/common/toaster/toaster';
import { cn } from '~/utils/cn';

/** Maximum number of rows that can be selected at once */
const MAX_SELECTABLE_ROWS = 1000;

/**
 * Engine props DataTable forwards to <DataGrid> unchanged. Sourced from
 * DataGridProps so their types/docs live in one place and new pure-passthrough
 * props only need adding to this key list; they then flow through `...gridProps`
 * with no extra plumbing.
 */
type ForwardedGridProps<TData> = Pick<
  DataGridProps<TData>,
  | 'onCellClick'
  | 'isRowSelectionDisabled'
  | 'sortColumns'
  | 'onSortColumnsChange'
  | 'isCompact'
  | 'hideHeader'
  | 'rowSelectionMode'
  | 'onRowReorder'
  | 'onRowReparent'
  | 'canDropRow'
  | 'renderRowDragPreview'
  | 'enableStickyHeader'
  | 'enableDragAutoScroll'
  | 'onRowsChange'
>;

interface DataTableProps<TData> extends ForwardedGridProps<TData> {
  columns: ColumnOrColumnGroup<TData>[];
  rows: TData[] | undefined;
  rowKeyGetter: (row: TData) => string;

  /** Query/async state: DataTable's own concern (skeleton, error, empty, infinite scroll). */
  hasNextPage: boolean;
  error?: Error | null;
  isLoading?: boolean;
  isFetching?: boolean;
  isFiltered?: boolean;
  NoRowsComponent?: React.ReactNode;
  fetchMore?: () => Promise<unknown>;
  /** Accepted for consumer API symmetry; not used by DataTable. */
  limit?: number;
  /** When this value changes, internal column widths are reset (re-measured from column defaults). */
  resetWidthsKey?: string | number | boolean;
  className?: string;
  /** When true, hides infinite loader (for static/non-paginated tables). Also forwarded to the grid. */
  readOnly?: boolean;
  enableVirtualization?: boolean;

  /** Selection: DataTable wraps onSelectedRowsChange with the max-selection cap. */
  selectedRows?: Set<string>;
  onSelectedRowsChange?: (selectedRows: Set<string>) => void;

  /** Renderers: DataTable bundles these into a stable `renderers` object. */
  renderRow?: (key: Key, props: RenderRowProps<TData, unknown>) => ReactNode;
  renderCell?: (key: Key, props: CellRendererProps<TData, unknown>) => ReactNode;

  /** Cell selection mode (focus + range). Defaulted to 'none' when readOnly. @default 'cell' */
  cellSelectionMode?: CellSelectionMode;
  rowHeight?: number;
}

/**
 * Query-backed table, the boundary between a data query and the grid engine.
 * Owns async/presentation state (loading skeleton, error panel, empty state,
 * infinite scroll, the max-selection cap, column-width reset) and forwards
 * everything else to <DataGrid> (the engine: virtualization, selection, editing,
 * keyboard nav, column layout). Pure engine props flow through untouched via
 * `...gridProps`; see {@link ForwardedGridProps}.
 */
export const DataTable = <TData,>({
  // DataTable-owned / transformed props, destructured so they don't leak into `...gridProps`.
  columns,
  rows,
  rowKeyGetter,
  hasNextPage,
  error,
  isLoading,
  isFetching,
  isFiltered,
  NoRowsComponent,
  fetchMore,
  limit,
  resetWidthsKey,
  className,
  readOnly,
  enableVirtualization,
  selectedRows,
  onSelectedRowsChange,
  renderRow,
  renderCell,
  cellSelectionMode,
  rowHeight = 52,
  // Everything else is a pure passthrough to <DataGrid>
  ...gridProps
}: DataTableProps<TData>) => {
  const { t } = useTranslation();

  const gridRef = useRef<HTMLDivElement | null>(null);
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(() => new Map());
  useTableTooltip(gridRef, !isLoading);

  // Reset column widths when resetWidthsKey changes (e.g., layout-affecting toggle)
  useEffect(() => {
    setColumnWidths(new Map());
  }, [resetWidthsKey]);

  // Only use DataGrid's near-end signal when virtualization is enabled;
  // otherwise delegate to InfiniteLoader's intersection observer (without
  // virtualization all rows render, so near-end would always be true).
  // Level-triggered: the grid reports near-end as state and this effect
  // fetches whenever the query can accept it, so demand raised during a
  // background refetch is served when it settles.
  const [nearEnd, setNearEnd] = useState(false);
  useFetchMoreOnDemand({
    demand: !!enableVirtualization && nearEnd,
    hasNextPage,
    isFetching: !!isFetching,
    error: !!error,
    fetchMore,
  });

  // Wrap selection handler to enforce max selection limit. Memoized so the
  // identity stays stable across renders; `DataGrid` passes it through to
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
    <div className={cn('mb-4 h-full w-full md:mb-8', className)}>
      {isLoading || !rows ? (
        // Render skeleton only on initial load
        <DataTableSkeleton
          cellsWidths={['3rem', '10rem', '4rem']}
          cellHeight={Number(rowHeight)}
          // Consumers pass the full column list (the grid filters `hidden`); match the
          // rendered column count so the skeleton doesn't over-draw then collapse.
          columnCount={columns.filter((column) => !column.hidden).length}
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
            {...gridProps}
            columns={columns}
            rows={rows}
            rowKeyGetter={rowKeyGetter}
            rowHeight={rowHeight}
            enableVirtualization={enableVirtualization}
            readOnly={readOnly}
            columnWidths={columnWidths}
            onColumnWidthsChange={setColumnWidths}
            selectedRows={selectedRows}
            onSelectedRowsChange={handleSelectedRowsChange}
            onNearEndChange={enableVirtualization ? setNearEnd : undefined}
            cellSelectionMode={cellSelectionMode ?? (readOnly ? 'none' : undefined)}
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
