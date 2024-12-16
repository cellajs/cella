import { forwardRef, memo, useEffect, useImperativeHandle, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDataFromSuspenseInfiniteQuery } from '~/hooks/use-data-from-query';
import { DataTable } from '~/modules/common/data-table';

import { Bird } from 'lucide-react';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import type { BaseTableMethods, BaseTableProps, Request } from '~/types/common';

import type { RequestsSearch } from '~/modules/system/requests-table';
import { requestsQueryOptions } from '~/modules/system/requests-table/helpers/query-option';

import type { SortColumn } from 'react-data-grid';
import { getSortColumns } from '~/modules/common/data-table/sort-columns';

type BaseRequestsTableProps = BaseTableProps<Request, RequestsSearch>;

const BaseRequestsTable = memo(
  forwardRef<BaseTableMethods, BaseRequestsTableProps>(({ columns, queryVars, updateCounts, setSearch }, ref) => {
    const { t } = useTranslation();

    // Extract query variables and set defaults
    const { q, sort = 'createdAt', order = 'desc', limit } = queryVars;

    const [sortColumns, setSortColumns] = useState<SortColumn[]>(getSortColumns(order, sort));

    // Update sort
    const updateSort = (newColumnsSort: SortColumn[]) => {
      setSortColumns(newColumnsSort);

      const [sortColumn] = newColumnsSort;
      const { columnKey, direction } = sortColumn;
      setSearch({ sort: columnKey as RequestsSearch['sort'], order: direction.toLowerCase() as RequestsSearch['order'] });
    };
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
          onSortColumnsChange: updateSort,
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:requests').toLowerCase() })} />,
        }}
      />
    );
  }),
);
export default BaseRequestsTable;
