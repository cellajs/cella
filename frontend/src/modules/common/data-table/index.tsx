import { InfiniteData, UseInfiniteQueryResult, UseSuspenseInfiniteQueryResult } from '@tanstack/react-query';
import { Row, Table as TableType, flexRender } from '@tanstack/react-table';
import { Loader2, Search, XCircle } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/modules/ui/table';
import { cn } from '~/lib/utils';

import { useOnScreen } from '~/hooks/use-on-screen';
import { Button } from '../../ui/button';

interface DataTableProps<TData> {
  className?: string;
  table: TableType<TData>;
  queryResult:
    | UseSuspenseInfiniteQueryResult<
        InfiniteData<
          {
            items: TData[];
            total: number;
          },
          unknown
        >,
        Error
      >
    | UseInfiniteQueryResult<
        InfiniteData<
          {
            items: TData[];
            total: number;
          },
          unknown
        >,
        Error
      >;
  isFiltered?: boolean;
  onResetFilters?: () => void;
  ToolbarComponent?: React.ReactNode;
  renderSubComponent?: (props: { row: Row<TData> }) => React.ReactElement;
  NoRowsComponent?: React.ReactNode;
  overflowNoRows?: boolean;
}

const Loading = ({ colSpan }: { colSpan: number }) => {
  return (
    <TableRow>
      <TableCell colSpan={colSpan}>
        <Loader2 className="text-muted-foreground my-4 mb mx-auto h-6 w-6 animate-spin" />
      </TableCell>
    </TableRow>
  );
};

function RowList<TData>({
  rows,
  colSpan,
  renderSubComponent,
  queryResult: { fetchNextPage, data, isFetching, error },
}: {
  rows: Row<TData>[];
  colSpan: number;
  queryResult: DataTableProps<TData>['queryResult'];
  renderSubComponent?: (props: { row: Row<TData> }) => React.ReactElement;
}) {
  const { measureRef, isIntersecting, observer } = useOnScreen();

  const fetchedRowCount = data?.pages?.[0]?.items?.length ?? 0;
  const totalDBRowCount = data?.pages?.[0]?.total ?? 0;
  const totalFetched = rows.length;

  useEffect(() => {
    if (isIntersecting && !isFetching && totalFetched < totalDBRowCount) {
      fetchNextPage();
      observer?.disconnect();
    }
  }, [isIntersecting, fetchNextPage]);

  const rowList = rows.map((originRow, index) => {
    const row = rows[originRow.index];

    return (
      <Fragment key={row.id}>
        <TableRow
          // set ref after 80% of the rows are fetched
          ref={index === Math.floor(rows.length - 1 - fetchedRowCount * 0.2) ? measureRef : undefined}
          data-state={row.getIsSelected() && 'selected'}
          className="[&:last-child>*]:border-none"
        >
          {row.getVisibleCells().map((cell) => (
            <TableCell
              key={cell.id}
              className="border-b"
              style={{
                width: cell.column.getSize(),
              }}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          ))}
        </TableRow>
        {row.getIsExpanded() && renderSubComponent && (
          <TableRow>
            <TableCell colSpan={row.getVisibleCells().length}>{renderSubComponent({ row })}</TableCell>
          </TableRow>
        )}
      </Fragment>
    );
  });

  if (totalFetched < totalDBRowCount && !error) {
    rowList.push(<Loading colSpan={colSpan} key="loading" />);
  }

  if (error) {
    rowList.push(<ErrorMessageRow colSpan={colSpan} error={new Error('Unable to load more. Reload or try again later')} key="error" />);
  }

  return rowList;
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

const ErrorMessageRow = ({
  colSpan,
  error,
}: {
  colSpan: number;
  error: Error;
}) => {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center text-red-500">
        {error.message}
      </TableCell>
    </TableRow>
  );
};

export function DataTable<TData>({
  className,
  table,
  queryResult,
  ToolbarComponent,
  renderSubComponent,
  NoRowsComponent,
  isFiltered,
  onResetFilters,
}: DataTableProps<TData>) {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const { error, isLoading, isFetching } = queryResult;
  const { rows } = table.getRowModel();
  const [initial, setInitial] = useState(false);

  useEffect(() => {
    if (error || !isLoading) {
      setInitial(true);
    }
  }, [isLoading, error]);

  return (
    <div className={cn('flex w-full flex-col space-y-4 h-full', className)}>
      {ToolbarComponent}
      {initial &&
        (error ? (
          <ErrorMessage error={error} />
        ) : !rows.length ? (
          <NoRows isFiltered={isFiltered} isFetching={isFetching} onResetFilters={onResetFilters} customComponent={NoRowsComponent} />
        ) : (
          <div className="grow overflow-hidden rounded-md relative">
            <Table
              tableContainerRef={tableContainerRef}
              // style={{
              //   width: table.getCenterTotalSize(),
              // }}
            >
              <TableHeader className="bg-background sticky top-0 z-10">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      return (
                        <TableHead
                          key={header.id}
                          className="border-b"
                          style={{
                            width: header.getSize(),
                          }}
                        >
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                <RowList rows={rows} colSpan={table.getAllColumns().length} renderSubComponent={renderSubComponent} queryResult={queryResult} />
              </TableBody>
            </Table>
          </div>
        ))}
    </div>
  );
}
