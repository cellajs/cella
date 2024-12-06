import { forwardRef, memo, useEffect, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import { useDataFromSuspenseInfiniteQuery } from '~/hooks/use-data-from-query';
import { DataTable } from '~/modules/common/data-table';

import { Bird } from 'lucide-react';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import type { BaseTableMethods, BaseTableProps, BaseTableQueryVariables, Request } from '~/types/common';

import type { RequestsSearch } from '~/modules/system/requests-table';
import { requestsQueryOptions } from '~/modules/system/requests-table/helpers/query-option';

type BaseRequestsTableProps = BaseTableProps<Request> & {
  queryVars: BaseTableQueryVariables<RequestsSearch>;
};

const BaseRequestsTable = memo(
  forwardRef<BaseTableMethods, BaseRequestsTableProps>(({ columns, sortColumns, setSortColumns, queryVars, updateCounts }, ref) => {
    const { t } = useTranslation();

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
          rowHeight: 42,
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