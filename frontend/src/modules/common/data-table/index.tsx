import { type Key, type ReactNode, useRef } from 'react';
import {
  type CellMouseArgs,
  type CellMouseEvent,
  DataGrid,
  type RenderRowProps,
  type RowsChangeData,
  type SortColumn,
} from '~/modules/common/data-grid';
import '~/modules/common/data-grid/style/data-grid.css';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { InfiniteLoader } from '~/modules/common/data-table/infinite-loader';
import { NoRows } from '~/modules/common/data-table/no-rows';
import '~/modules/common/data-table/style.css';
import { DataTableSkeleton } from '~/modules/common/data-table/table-skeleton';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useTableTooltip } from '~/modules/common/data-table/use-table-tooltip';
import { toaster } from '~/modules/common/toaster/service';
import { Checkbox } from '~/modules/ui/checkbox';
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
  NoRowsComponent?: React.ReactNode;
  overflowNoRows?: boolean;
  onCellClick?: (args: CellMouseArgs<TData, unknown>, event: CellMouseEvent) => void;
  selectedRows?: Set<string>;
  onSelectedRowsChange?: (selectedRows: Set<string>) => void;
  sortColumns?: SortColumn[];
  onSortColumnsChange?: (sortColumns: SortColumn[]) => void;
  rowHeight?: number;
  hideHeader?: boolean;
  enableVirtualization?: boolean;
  onRowsChange?: (rows: TData[], data: RowsChangeData<TData>) => void;
  fetchMore?: () => Promise<unknown>;
  className?: string;
  /** When true, hides infinite loader (for static/non-paginated tables) */
  readOnly?: boolean;
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
  rowHeight = 52,
  hideHeader,
  enableVirtualization,
  onRowsChange,
  fetchMore,
  renderRow,
  onCellClick,
  className,
  readOnly,
}: DataTableProps<TData>) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm', false);

  const gridRef = useRef<HTMLDivElement | null>(null);
  useTableTooltip(gridRef, !isLoading);

  // Handle infinite scroll - guards against multiple calls while fetching
  const handleRowsEndApproaching = () => {
    if (!fetchMore || isFetching || !hasNextPage) return;
    fetchMore();
  };

  // Wrap selection handler to enforce max selection limit
  const handleSelectedRowsChange = (newSelectedRows: Set<string>) => {
    if (!onSelectedRowsChange) return;

    const currentSize = selectedRows?.size ?? 0;
    const newSize = newSelectedRows.size;

    // Check if trying to select more than the limit
    if (newSize > MAX_SELECTABLE_ROWS) {
      // If this is a "select all" attempt (large jump in selection)
      if (newSize - currentSize > 1) {
        toaster(t('common:selection_limit_all', { max: MAX_SELECTABLE_ROWS }), 'warning');
      } else {
        toaster(t('common:selection_limit', { max: MAX_SELECTABLE_ROWS }), 'warning');
      }
      return;
    }

    onSelectedRowsChange(newSelectedRows);
  };

  return (
    <div className={cn('w-full h-full mb-4 md:mb-8 focus-view-scroll', className)}>
      {isLoading || !rows ? (
        // Render skeleton only on initial load
        <DataTableSkeleton
          cellsWidths={['3rem', '10rem', '4rem']}
          cellHeight={Number(rowHeight)}
          columnCount={columns.length}
        />
      ) : (
        <>
          {error && rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full w-full bg-background text-muted-foreground">
              <div className="text-center my-8 text-sm text-red-600">{error.message}</div>
            </div>
          ) : !rows.length ? (
            <NoRows isFiltered={isFiltered} isFetching={isFetching} customComponent={NoRowsComponent} />
          ) : (
            <div
              className={`grid rdg-wrapper relative ${hideHeader ? 'rdg-hide-header' : ''} ${readOnly ? 'rdg-readonly' : ''}`}
              ref={gridRef}
            >
              <DataGrid
                rowHeight={isMobile ? rowHeight * 1.2 : rowHeight}
                enableVirtualization={enableVirtualization}
                rowKeyGetter={rowKeyGetter}
                columns={columns}
                onRowsChange={onRowsChange}
                rows={rows}
                onCellClick={onCellClick}
                // Hack to rerender html/css by changing width
                style={{ blockSize: '100%', marginRight: columns.length % 2 === 0 ? '0' : '.05rem' }}
                selectedRows={selectedRows}
                onSelectedRowsChange={handleSelectedRowsChange}
                sortColumns={sortColumns}
                onSortColumnsChange={onSortColumnsChange}
                onRowsEndApproaching={handleRowsEndApproaching}
                selectionMode={readOnly ? 'none' : undefined}
                renderers={{
                  renderRow,
                  renderCheckbox: ({ onChange, ...props }) => {
                    const withShift = useRef(false);

                    delete props.indeterminate;

                    const handleChange = (checked: boolean) => {
                      onChange(checked, withShift.current);
                    };

                    return (
                      <Checkbox
                        {...props}
                        onClick={(e) => {
                          withShift.current = e.nativeEvent.shiftKey;
                        }}
                        onCheckedChange={(checked) => {
                          handleChange(!!checked);
                        }}
                      />
                    );
                  },
                }}
              />
              {!readOnly && (
                <InfiniteLoader hasNextPage={hasNextPage} isFetching={isFetching} isFetchMoreError={!!error} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
