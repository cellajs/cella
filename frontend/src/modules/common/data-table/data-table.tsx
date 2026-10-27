import { ServerCrashIcon } from 'lucide-react';
import { type Key, type ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import {
  type CellRendererProps,
  type CellSelectionMode,
  type ColumnWidths,
  DataGrid,
  type DataGridProps,
  type RenderRowProps,
  type RowsChangeData,
} from '~/modules/common/data-grid';
import { EditStatusContext, useEditStatus } from '~/modules/common/data-grid/cell-renderers';
import { DataTableSkeleton } from '~/modules/common/data-table/data-table-skeleton';
import { InfiniteLoader } from '~/modules/common/data-table/infinite-loader';
import { NoRows } from '~/modules/common/data-table/no-rows';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useFetchMoreOnDemand } from '~/modules/common/data-table/use-fetch-more-on-demand';
import { useTableTooltip } from '~/modules/common/data-table/use-table-tooltip';
import { toaster } from '~/modules/common/toaster/toaster';
import { cn } from '~/utils/cn';

const maxSelectableRows = 1000;
const noWidths: ColumnWidths = new Map();

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
>;

interface DataTableProps<TData> extends ForwardedGridProps<TData> {
  columns: ColumnOrColumnGroup<TData>[];
  rows: TData[] | undefined;
  rowKeyGetter: (row: TData) => string;
  /** Returning the save's promise shows the edited cells saving in a `RenderEditStatus` until it settles. */
  onRowsChange?: (rows: TData[], data: RowsChangeData<TData>) => unknown;

  // Query state, from which DataTable renders the skeleton, the error, the empty state and the infinite scroll
  hasNextPage: boolean;
  error?: Error | null;
  isLoading?: boolean;
  isFetching?: boolean;
  isFiltered?: boolean;
  /** The empty state while nothing is filtered, usually a ContentPlaceholder. */
  NoRowsComponent?: ReactNode;
  fetchMore?: () => Promise<unknown>;
  /** The last column resize belongs to this value: while another value holds, columns take their default widths. */
  resetWidthsKey?: string | number | boolean;
  className?: string;
  /** When true, hides infinite loader (for static/non-paginated tables). Also forwarded to the grid. */
  readOnly?: boolean;
  enableVirtualization?: boolean;

  selectedRows?: Set<string>;
  /** Skipped for a change past maxSelectableRows, which toasts a warning. */
  onSelectedRowsChange?: (selectedRows: Set<string>) => void;

  renderRow?: (key: Key, props: RenderRowProps<TData, unknown>) => ReactNode;
  renderCell?: (key: Key, props: CellRendererProps<TData, unknown>) => ReactNode;

  /** Cell selection mode (focus + range). Defaulted to 'none' when readOnly. @default 'cell' */
  cellSelectionMode?: CellSelectionMode;
  /** Row height in px, for the grid and its skeleton. Defaults to 52. */
  rowHeight?: number;
}

/** The row key of a table whose rows carry an `id`. */
export function rowKeyById(row: { id: string }): string {
  return row.id;
}

/** Bridges query presentation state and infinite scrolling to the DataGrid engine. */
export function DataTable<TData>({
  // DataTable-owned / transformed props, destructured so they don't leak into `...gridProps`.
  columns,
  rows,
  rowKeyGetter,
  onRowsChange,
  hasNextPage,
  error,
  isLoading,
  isFetching,
  isFiltered,
  NoRowsComponent,
  fetchMore,
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

  // The grid div remounts after an empty state; held in state, each new element gets the tooltip listeners
  const [gridElement, setGridElement] = useState<HTMLDivElement | null>(null);
  useTableTooltip(gridElement);

  const [widths, setWidths] = useState({ key: resetWidthsKey, map: noWidths });
  const columnWidths = widths.key === resetWidthsKey ? widths.map : noWidths;

  // Virtualized tables use the grid's near-end state; fully rendered tables use InfiniteLoader observation.
  const [nearEnd, setNearEnd] = useState(false);
  useFetchMoreOnDemand({ demand: !!enableVirtualization && nearEnd, hasNextPage, isFetching: !!isFetching, hasError: !!error, fetchMore });

  // Memoized because `DataGrid` passes it to memoized rows; a fresh function each render defeats that memo.
  const handleSelectedRowsChange = useCallback(
    (newSelectedRows: Set<string>) => {
      if (!onSelectedRowsChange) return;

      const currentSize = selectedRows?.size ?? 0;
      const newSize = newSelectedRows.size;

      if (newSize > maxSelectableRows) {
        // A jump of more than one row is a "select all" attempt.
        toaster.warning(t(newSize - currentSize > 1 ? 'c:selection_limit_all' : 'c:selection_limit', { max: maxSelectableRows }));
        return;
      }

      onSelectedRowsChange(newSelectedRows);
    },
    [onSelectedRowsChange, selectedRows, t],
  );

  // A fresh `{ renderRow, renderCell }` literal each render would invalidate Row's memo.
  const renderers = useMemo(() => ({ renderRow, renderCell }), [renderRow, renderCell]);

  const edits = useEditStatus(rows ?? [], rowKeyGetter, onRowsChange);

  const frameClass = cn('mb-4 size-full md:mb-8', className);

  // A failed first load has no rows, so the skeleton shows only while no error is known.
  if ((isLoading || !rows) && !error) {
    return (
      <div className={frameClass}>
        <DataTableSkeleton
          cellWidths={['3rem', '10rem', '4rem']}
          cellHeight={rowHeight}
          // Count only visible columns so the skeleton matches what the grid renders.
          columnCount={columns.filter((column) => !column.hidden).length}
        />
      </div>
    );
  }

  if (!rows?.length) {
    return (
      <div className={frameClass}>
        {error ? (
          <ContentPlaceholder icon={ServerCrashIcon} title="error:request_failed">
            <p className="text-destructive text-sm">{error.message}</p>
          </ContentPlaceholder>
        ) : (
          <NoRows isFiltered={isFiltered} isFetching={isFetching} emptyContent={NoRowsComponent} />
        )}
      </div>
    );
  }

  return (
    <div className={frameClass}>
      <div className="relative grid" ref={setGridElement}>
        <EditStatusContext value={edits.statusOf}>
          <DataGrid
            {...gridProps}
            columns={columns}
            rows={edits.rows}
            rowKeyGetter={rowKeyGetter}
            onRowsChange={edits.onRowsChange}
            rowHeight={rowHeight}
            enableVirtualization={enableVirtualization}
            readOnly={readOnly}
            columnWidths={columnWidths}
            onColumnWidthsChange={(map) => setWidths({ key: resetWidthsKey, map })}
            selectedRows={selectedRows}
            onSelectedRowsChange={handleSelectedRowsChange}
            onNearEndChange={enableVirtualization ? setNearEnd : undefined}
            cellSelectionMode={cellSelectionMode ?? (readOnly ? 'none' : undefined)}
            renderers={renderers}
          />
        </EditStatusContext>
        {!readOnly && (
          <InfiniteLoader
            hasNextPage={hasNextPage}
            isFetching={isFetching}
            isFetchMoreError={!!error}
            fetchMore={!enableVirtualization ? fetchMore : undefined}
          />
        )}
      </div>
    </div>
  );
}
