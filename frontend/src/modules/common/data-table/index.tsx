import 'react-data-grid/lib/styles.css';

import { Loader2, Search, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import DataGrid, { Row, RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';

import { useOnScreen } from '~/hooks/use-on-screen';
import { Button } from '../../ui/button';
import { ColumnOrColumnGroup } from './columns-view';
import './style.css';

interface DataTableProps<TData> {
  columns: ColumnOrColumnGroup<TData>[];
  rows: TData[];
  rowKeyGetter: (row: TData) => string;
  error?: Error | null;
  isLoading?: boolean;
  isFetching?: boolean;
  isFiltered?: boolean;
  onResetFilters?: () => void;
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
            <div>{t('label.no_results_found')}</div>
            <Button variant="link" onClick={onResetFilters}>
              <XCircle size={16} className="mr-1" />
              Clear
            </Button>
          </div>
        </>
      )}
      {!isFiltered && !isFetching && (customComponent ?? t('label.no_results'))}
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
    <div className="w-full h-full">
      {initial &&
        (error && rows.length === 0 ? (
          <ErrorMessage error={error} />
        ) : !rows.length ? (
          <NoRows isFiltered={isFiltered} isFetching={isFetching} onResetFilters={onResetFilters} customComponent={NoRowsComponent} />
        ) : (
          <div className="grid rdg-wrapper">
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
                  // 50 because loading 50 records
                  const isTargetRow = props.rowIdx === Math.floor(rows.length - 1 - 50 * 0.2);
                  return <Row {...props} key={key} ref={isTargetRow ? measureRef : undefined} />;
                },
                renderCheckbox: ({ onChange, ...props }) => {
                  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
                    onChange(e.target.checked, (e.nativeEvent as MouseEvent).shiftKey);
                  }

                  return <input type="checkbox" {...props} onChange={handleChange} />;
                },
              }}
            />
            {isFetching && !error && (
              <div className="flex justify-center items-center">
                <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
              </div>
            )}
            {error && <div className=" text-center text-red-500">Could not load more data. Something went wrong.</div>}
          </div>
        ))}
    </div>
  );
}
