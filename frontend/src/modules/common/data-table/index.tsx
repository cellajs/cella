import 'react-data-grid/lib/styles.css';

import { Search } from 'lucide-react';
import { type Key, type ReactNode, useEffect, useState } from 'react';
import DataGrid, { type RenderRowProps, type CellClickArgs, type CellMouseEvent, type RowsChangeData, type SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';

import { useRef } from 'react';
import { useInView } from 'react-intersection-observer';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import { Checkbox } from '~/modules/ui/checkbox';
import '~/modules/common/data-table/style.css';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTableSkeleton } from '~/modules/common/data-table/table-skeleton';
import Spinner from '~/modules/common/spinner';
import { Button } from '~/modules/ui/button';

interface DataTableProps<TData> {
  columns: ColumnOrColumnGroup<TData>[];
  rows: TData[];
  totalCount?: number;
  rowKeyGetter: (row: TData) => string;
  error?: Error | null;
  isLoading?: boolean;
  isFetching?: boolean;
  limit?: number;
  isFiltered?: boolean;
  renderRow?: (key: Key, props: RenderRowProps<TData, unknown>) => ReactNode;
  NoRowsComponent?: React.ReactNode;
  overflowNoRows?: boolean;
  onCellClick?: (args: CellClickArgs<TData, unknown>, event: CellMouseEvent) => void;
  selectedRows?: Set<string>;
  onSelectedRowsChange?: (selectedRows: Set<string>) => void;
  sortColumns?: SortColumn[];
  onSortColumnsChange?: (sortColumns: SortColumn[]) => void;
  rowHeight?: number;
  enableVirtualization?: boolean;
  onRowsChange?: (rows: TData[], data: RowsChangeData<TData>) => void;
  fetchMore?: () => Promise<unknown>;
}

const NoRows = ({
  isFiltered,
  isFetching,
  customComponent,
}: {
  isFiltered?: boolean;
  isFetching?: boolean;
  customComponent?: React.ReactNode;
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center w-full p-8">
      {isFiltered && !isFetching && (
        <ContentPlaceholder Icon={Search} title={t('common:no_resource_found', { resource: t('common:results').toLowerCase() })} />
      )}
      {!isFiltered && !isFetching && (customComponent ?? t('common:no_resource_yet', { resource: t('common:results').toLowerCase() }))}
    </div>
  );
};

const ErrorMessage = ({
  error,
}: {
  error: Error;
}) => {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-background text-muted-foreground">
      <div className="text-center my-8 text-sm text-red-500">{error.message}</div>
    </div>
  );
};

export const DataTable = <TData,>({
  columns,
  rows,
  totalCount,
  rowKeyGetter,
  error,
  isLoading,
  limit = 10,
  isFetching,
  NoRowsComponent,
  isFiltered,
  selectedRows,
  onSelectedRowsChange,
  sortColumns,
  onSortColumnsChange,
  rowHeight = 40,
  enableVirtualization,
  onRowsChange,
  fetchMore,
  renderRow,
  onCellClick,
}: DataTableProps<TData>) => {
  const { t } = useTranslation();
  const [initialDone, setInitialDone] = useState(false);
  const { ref: measureRef, inView } = useInView({
    triggerOnce: false,
    threshold: 0,
  });

  useEffect(() => {
    if (!rows.length || error) return;
    if (inView && !isFetching) {
      if (typeof totalCount === 'number' && rows.length >= totalCount) return;
      fetchMore?.();
    }
  }, [inView, error, fetchMore]);

  useEffect(() => {
    if (initialDone) return;
    if (!isLoading) setInitialDone(true);
  }, [isLoading]);

  return (
    <div className="w-full h-full mb-4 md:mb-8">
      {initialDone ? ( // Render skeleton only on initial load
        <>
          {error && rows.length === 0 ? (
            <ErrorMessage error={error as Error} />
          ) : !rows.length ? (
            <NoRows isFiltered={isFiltered} isFetching={isFetching} customComponent={NoRowsComponent} />
          ) : (
            <div className="grid rdg-wrapper relative">
              <DataGrid
                rowHeight={rowHeight}
                enableVirtualization={enableVirtualization}
                rowKeyGetter={rowKeyGetter}
                columns={columns}
                onRowsChange={onRowsChange}
                rows={rows}
                onCellClick={onCellClick}
                className="fill-grid"
                // NOTICE: Hack to rerender html/css by changing width
                style={{ marginRight: columns.length % 2 === 0 ? '0' : '.07rem' }}
                selectedRows={selectedRows}
                onSelectedRowsChange={onSelectedRowsChange}
                sortColumns={sortColumns}
                onSortColumnsChange={onSortColumnsChange}
                renderers={{
                  renderRow,
                  renderCheckbox: ({ onChange, ...props }) => {
                    const withShift = useRef(false);

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

              {/* Infinite loading measure ref */}
              <div
                key={totalCount}
                ref={measureRef}
                className="h-4 w-0 bg-red-700 absolute bottom-0 z-[200]"
                style={{
                  height: `${rows.length * 0.2 * rowHeight}px`,
                  maxHeight: `${rowHeight * limit}px`,
                }}
              />

              {/* Loading */}
              {isFetching && !error && (
                <div className="my-4">
                  <Spinner inline noDelay />
                </div>
              )}

              {/* Infinite scroll is stuck */}
              {!isFetching && !error && totalCount && totalCount > rows.length && (
                <Button variant="ghost" className="w-full my-6 opacity-30" onClick={fetchMore}>
                  {t('common:click_fetch.text')}
                </Button>
              )}

              {/* Error */}
              {error && <div className="text-center my-8 text-sm text-red-500">{t('common:error.load_more_failed')}</div>}
            </div>
          )}
        </>
      ) : (
        <DataTableSkeleton cellsWidths={['3rem', '10rem', '4rem']} cellHeight={Number(rowHeight)} columnCount={columns.length} />
      )}
    </div>
  );
};
