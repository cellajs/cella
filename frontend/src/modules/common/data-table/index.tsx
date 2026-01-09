import { appConfig } from 'config';
import { type Key, type ReactNode, useRef } from 'react';
import {
  type CellMouseArgs,
  type CellMouseEvent,
  DataGrid,
  type RenderRowProps,
  type RowsChangeData,
  type SortColumn,
} from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { InfiniteLoader } from '~/modules/common/data-table/infinite-loader';
import { NoRows } from '~/modules/common/data-table/no-rows';
import '~/modules/common/data-table/style.css';
import { DataTableSkeleton } from '~/modules/common/data-table/table-skeleton';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useTableTooltip } from '~/modules/common/data-table/use-table-tooltip';
import { Checkbox } from '~/modules/ui/checkbox';
import { cn } from '~/utils/cn';

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
  limit = appConfig.requestLimits.default,
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
}: DataTableProps<TData>) => {
  const isMobile = useBreakpoints('max', 'sm', false);

  const gridRef = useRef<HTMLDivElement | null>(null);
  useTableTooltip(gridRef, !isLoading);

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
            <div className={`grid rdg-wrapper relative ${hideHeader ? 'rdg-hide-header' : ''}`} ref={gridRef}>
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
                onSelectedRowsChange={onSelectedRowsChange}
                sortColumns={sortColumns}
                onSortColumnsChange={onSortColumnsChange}
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
              <InfiniteLoader
                hasNextPage={hasNextPage}
                isFetching={isFetching}
                isFetchMoreError={!!error}
                measureStyle={{
                  height: `${Math.min(rows.length, 200) * 0.25 * rowHeight}px`,
                  maxHeight: `${rowHeight * limit}px`,
                }}
                fetchMore={fetchMore}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};
