import 'react-data-grid/lib/styles.css';

import { Loader2, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import DataGrid, { type CellClickArgs, type CellMouseEvent, type RowsChangeData, type SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';

import { useRef } from 'react';
import { useInView } from 'react-intersection-observer';
import { Checkbox } from '~/modules/ui/checkbox';
import type { ColumnOrColumnGroup } from './columns-view';
import './style.css';
import ContentPlaceholder from '../content-placeholder';
import { DataTableSkeleton } from './table-skeleton';

interface DataTableProps<TData> {
  columns: ColumnOrColumnGroup<TData>[];
  rows: TData[];
  totalCount?: number;
  rowKeyGetter: (row: TData) => string;
  error?: Error | null;
  isLoading?: boolean;
  isFetching?: boolean;
  limit: number;
  isFiltered?: boolean;
  NoRowsComponent?: React.ReactNode;
  overflowNoRows?: boolean;
  onCellClick?: (args: CellClickArgs<TData, unknown>, event: CellMouseEvent) => void;
  selectedRows?: Set<string>;
  onSelectedRowsChange?: (selectedRows: Set<string>) => void;
  sortColumns?: SortColumn[];
  onSortColumnsChange?: (sortColumns: SortColumn[]) => void;
  rowHeight?: number | ((row: TData) => number);
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
  limit,
  isFetching,
  NoRowsComponent,
  isFiltered,
  selectedRows,
  onSelectedRowsChange,
  sortColumns,
  onSortColumnsChange,
  rowHeight,
  enableVirtualization,
  onRowsChange,
  fetchMore,
  onCellClick,
}: DataTableProps<TData>) => {
  const { t } = useTranslation();
  const [initialDone, setInitialDone] = useState(false);
  const { ref: measureRef, inView } = useInView({
    triggerOnce: false,
    threshold: 0,
  });

  useEffect(() => {
    if (!rows.length) return;

    if (inView && !isFetching) {
      if (typeof totalCount === 'number' && rows.length >= totalCount) {
        return;
      }
      fetchMore?.();
    }
  }, [inView, fetchMore]);

  useEffect(() => {
    if (error || !isLoading) {
      setInitialDone(true);
    }
  }, [isLoading, error]);

  return (
    <div className="w-full h-full">
      {initialDone ? ( // Render skeleton only on initial load
        <>
          {error && rows.length === 0 ? (
            <ErrorMessage error={error as Error} />
          ) : !rows.length ? (
            <NoRows isFiltered={isFiltered} isFetching={isFetching} customComponent={NoRowsComponent} />
          ) : (
            <div className="grid rdg-wrapper">
              <DataGrid
                rowHeight={rowHeight}
                enableVirtualization={enableVirtualization}
                rowKeyGetter={rowKeyGetter}
                columns={columns}
                onRowsChange={onRowsChange}
                rows={rows}
                onCellClick={onCellClick}
                className="fill-grid"
                // TODO Hack to rerender css by changing width
                style={{ marginRight: columns.length % 2 === 0 ? '0px' : '1px' }}
                selectedRows={selectedRows}
                onSelectedRowsChange={onSelectedRowsChange}
                sortColumns={sortColumns}
                onSortColumnsChange={onSortColumnsChange}
                renderers={{
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
                ref={measureRef}
                className="h-0 w-0 relative z-[200]"
                style={{ marginTop: -Number(rowHeight || 40) * limit * (rows.length < 60 ? 0.5 : 1) }}
              />

              {/* Loading */}
              {isFetching && !error && <Loader2 className="text-muted-foreground h-6 w-6 mx-auto my-4 animate-spin" />}

              {/* Error */}
              {error && <div className="text-center my-8 text-sm text-red-500">{t('common:error.load_more_failed')}</div>}
            </div>
          )}
        </>
      ) : (
        <DataTableSkeleton cellsWidths={['48px', '48px']} cellHeight={Number(rowHeight)} columnCount={columns.length} />
      )}
    </div>
  );
};
