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

const MAX_SELECTABLE_ROWS = 1000;

/** DataGrid props forwarded unchanged through `gridProps`, retaining their source types and docs. */
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
  | 'rowClass'
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

/** Bridges query presentation state and infinite scrolling to the DataGrid engine. */
export function DataTable<TData>({
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
  ...gridProps
}: DataTableProps<TData>) {
  const { t } = useTranslation();

  const gridRef = useRef<HTMLDivElement | null>(null);
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(() => new Map());
  useTableTooltip(gridRef, !isLoading);

  useEffect(() => {
    setColumnWidths(new Map());
  }, [resetWidthsKey]);

  // Virtualized tables use the grid's near-end state; fully rendered tables use InfiniteLoader observation.
  const [nearEnd, setNearEnd] = useState(false);
  useFetchMoreOnDemand({
    demand: !!enableVirtualization && nearEnd,
    hasNextPage,
    isFetching: !!isFetching,
    error: !!error,
    fetchMore,
  });

  // Memoized because `DataGrid` passes it to memoized rows; a fresh function each render defeats that memo.
  const handleSelectedRowsChange = useCallback(
    (newSelectedRows: Set<string>) => {
      if (!onSelectedRowsChange) return;

      const currentSize = selectedRows?.size ?? 0;
      const newSize = newSelectedRows.size;

      if (newSize > MAX_SELECTABLE_ROWS) {
        // A jump of more than one row is a "select all" attempt.
        if (newSize - currentSize > 1) {
          toaster.warning(t('c:selection_limit_all', { max: MAX_SELECTABLE_ROWS }));
        } else {
          toaster.warning(t('c:selection_limit', { max: MAX_SELECTABLE_ROWS }));
        }
        return;
      }

      onSelectedRowsChange(newSelectedRows);
    },
    [onSelectedRowsChange, selectedRows, t],
  );

  // A fresh `{ renderRow, renderCell }` literal each render would invalidate Row's memo.
  const renderers = useMemo(() => ({ renderRow, renderCell }), [renderRow, renderCell]);

  return (
    <div className={cn('mb-4 h-full w-full md:mb-8', className)}>
      {isLoading || !rows ? (
        <DataTableSkeleton
          cellsWidths={['3rem', '10rem', '4rem']}
          cellHeight={Number(rowHeight)}
          // Count only visible columns so the skeleton matches what the grid renders.
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
}
