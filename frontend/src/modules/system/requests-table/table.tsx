import { infiniteQueryOptions } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { useDataFromSuspenseInfiniteQuery } from '~/hooks/use-data-from-query';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { DataTable } from '~/modules/common/data-table';
import ColumnsView from '~/modules/common/data-table/columns-view';
import { getInitialSortColumns } from '~/modules/common/data-table/sort-columns';
import { FocusView } from '~/modules/common/focus-view';

import { config } from 'config';
import { Bird } from 'lucide-react';
import { type GetRequestsParams, getRequests } from '~/api/requests';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { RequestsTableRoute } from '~/routes/system';
import type { Request } from '~/types/common';

import Export from '~/modules/common/data-table/export';
import type { RequestsSearch, RequestsTableMethods } from '~/modules/system/requests-table';
import { useColumns } from '~/modules/system/requests-table/columns';
import { getPaginatedOffset } from '~/utils/mutate-query';

const LIMIT = config.requestLimits.requests;
type BaseRequestsTableProps = { tableId: string; tableFilterBar: React.ReactNode };

export const requestsQueryOptions = ({ q = '', sort: initialSort, order: initialOrder, limit = LIMIT }: GetRequestsParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = ['requests', 'list', q, sort, order];
  const offset = getPaginatedOffset(queryKey);

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => await getRequests({ page, q, sort, order, limit, offset }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

export const BaseRequestsTable = forwardRef<RequestsTableMethods, BaseRequestsTableProps>(
  ({ tableId, tableFilterBar }: BaseRequestsTableProps, ref) => {
    const search = useSearch({ from: RequestsTableRoute.id });
    const { t } = useTranslation();

    // Table state
    const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

    // Search query options
    const sort = sortColumns[0]?.columnKey as RequestsSearch['sort'];
    const order = sortColumns[0]?.direction.toLowerCase() as RequestsSearch['order'];
    const limit = LIMIT;

    const isFiltered = !!search.q;

    // Query requests
    const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } =
      useDataFromSuspenseInfiniteQuery(requestsQueryOptions({ q: search.q, sort, order, limit }));

    // Table selection
    const selectedRequests = useMemo(() => {
      return rows.filter((row) => selectedRows.has(row.id));
    }, [selectedRows, rows]);

    // Build columns
    const [columns, setColumns] = useColumns();

    // Save filters in search params
    const filters = useMemo(() => ({ sort, order }), [sortColumns]);
    useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

    const onRowsChange = async (changedRows: Request[]) => {
      setRows(changedRows);
    };

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => setSelectedRows(new Set<string>()),
      //TODO implement accept and remove of request
      openRemoveDialog: () => console.log('removed'),
      openInviteDialog: () => console.log('invited'),
    }));

    return (
      <div id={tableId} data-total-count={totalCount} data-selected={selectedRequests.length} className="flex flex-col gap-4 h-full">
        <div className={'flex items-center max-sm:justify-between md:gap-2'}>
          {/* Filter bar */}
          {tableFilterBar}

          {/* Columns view */}
          <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

          {/* Export */}
          <Export
            className="max-lg:hidden"
            filename={`${config.slug}-requests`}
            columns={columns}
            fetchRows={async (limit) => {
              const { items } = await getRequests({ limit, q: search.q, sort, order });
              return items;
            }}
          />

          {/* Focus view */}
          <FocusView iconOnly />
        </div>

        {/* Table */}
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
            isFiltered,
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
      </div>
    );
  },
);
