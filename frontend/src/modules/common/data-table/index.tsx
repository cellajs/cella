import 'react-data-grid/lib/styles.css';

import DataGrid, { ColumnOrColumnGroup, Row, RowsChangeData, SortColumn } from 'react-data-grid';
import { Search, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../ui/button';
import { useOnScreen } from '~/hooks/use-on-screen';

interface DataTableProps<TData> {
  columns: ColumnOrColumnGroup<TData>[];
  rows: TData[];
  rowKeyGetter: (row: TData) => string;
  error?: Error | null;
  isLoading?: boolean;
  isFetching?: boolean;
  isFiltered?: boolean;
  onResetFilters?: () => void;
  ToolbarComponent?: React.ReactNode;
  NoRowsComponent?: React.ReactNode;
  overflowNoRows?: boolean;

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
  onResetFilters,
  customComponent,
}: {
  isFiltered?: boolean;
  isFetching?: boolean;
  onResetFilters?: () => void;
  customComponent?: React.ReactNode;
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-background text-muted-foreground">
      {isFiltered && !isFetching && (
        <>
          <Search className="w-24 h-24" />
          <div className="flex items-center justify-center mt-6">
            <div>
              {t('label.no_results_found', {
                defaultValue: 'No results found.',
              })}
            </div>
            <Button variant="link" onClick={onResetFilters}>
              <XCircle size={16} className="mr-1" />
              Clear
            </Button>
          </div>
        </>
      )}
      {!isFiltered &&
        !isFetching &&
        (customComponent ??
          t('label.no_results', {
            defaultValue: 'No results',
          }))}
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
      <div className="text-center text-red-500">{error.message}</div>
    </div>
  );
};

export function DataTable<TData>({
  columns,
  rows,
  rowKeyGetter,
  error,
  isLoading,
  isFetching,
  ToolbarComponent,
  NoRowsComponent,
  isFiltered,
  onResetFilters,
  selectedRows,
  onSelectedRowsChange,
  sortColumns,
  onSortColumnsChange,
  rowHeight,
  enableVirtualization,
  onRowsChange,
  fetchMore,
}: DataTableProps<TData>) {
  const { measureRef, isIntersecting, observer } = useOnScreen({
    firstChild: true,
  });

  const [initial, setInitial] = useState(false);

  useEffect(() => {
    console.log('fetchMore');
    if (isIntersecting && !isFetching) {
      fetchMore?.();
      observer?.disconnect();
    }
  }, [isIntersecting, fetchMore]);

  useEffect(() => {
    if (error || !isLoading) {
      setInitial(true);
    }
  }, [isLoading, error]);

  return (
    <div className='flex w-full flex-col space-y-4 h-full'>
      {ToolbarComponent}
      {initial &&
        (error ? (
          <ErrorMessage error={error} />
        ) : !rows.length ? (
          <NoRows isFiltered={isFiltered} isFetching={isFetching} onResetFilters={onResetFilters} customComponent={NoRowsComponent} />
        ) : (
          <div className="grid">
            <DataGrid
              rowHeight={rowHeight}
              enableVirtualization={enableVirtualization}
              rowKeyGetter={rowKeyGetter}
              columns={columns}
              onRowsChange={onRowsChange}
              rows={rows}
              className="fill-grid"
              selectedRows={selectedRows}
              onSelectedRowsChange={onSelectedRowsChange}
              sortColumns={sortColumns}
              onSortColumnsChange={onSortColumnsChange}
              renderers={{
                renderRow: (key, props) => {
                  return <Row {...props} key={key} ref={props.rowIdx === Math.floor(rows.length - 1 - rows.length * 0.2) ? measureRef : undefined} />;
                }
              }}
            />
          </div>
        ))}
    </div>
  );
}