import { Bird } from 'lucide-react';
import { forwardRef, memo, useEffect, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { requestsQueryOptions } from '~/modules/requests/query';
import type { RequestsSearch } from '~/modules/requests/requests-table';
import { useDataFromSuspenseInfiniteQuery } from '~/query/hooks/use-data-from-query';
import type { BaseTableMethods, BaseTableProps, Request } from '~/types/common';

type BaseRequestsTableProps = BaseTableProps<Request, RequestsSearch>;

const BaseRequestsTable = memo(
  forwardRef<BaseTableMethods, BaseRequestsTableProps>(({ columns, queryVars, updateCounts, sortColumns, setSortColumns }, ref) => {
    const { t } = useTranslation();

    // Extract query variables and set defaults
    const { q, sort, order, limit } = queryVars;

    // Query requests
    const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } =
      useDataFromSuspenseInfiniteQuery(requestsQueryOptions({ q, sort, order, limit }));

    const onRowsChange = async (changedRows: Request[]) => setRows(changedRows);

    useEffect(() => {
      updateCounts(
        rows.filter((row) => selectedRows.has(row.id)),
        totalCount,
      );
    }, [selectedRows, rows, totalCount]);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => setSelectedRows(new Set<string>()),
    }));

    return (
      <DataTable<Request>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          totalCount,
          rowHeight: 50,
          rowKeyGetter: (row) => row.id,
          error,
          isLoading,
          isFetching,
          enableVirtualization: false,
          isFiltered: !!q,
          limit,
          onRowsChange,
          fetchMore: fetchNextPage,
          sortColumns,
          selectedRows,
          onSelectedRowsChange: setSelectedRows,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:requests').toLowerCase() })} />,
        }}
      />
    );
  }),
);
export default BaseRequestsTable;
