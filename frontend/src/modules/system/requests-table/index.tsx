import { infiniteQueryOptions, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

import type { getRequestsQuerySchema } from 'backend/modules/requests/schema';
import { config } from 'config';
import { Bird } from 'lucide-react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { type GetRequestsParams, getRequests } from '~/api/requests';
import { useDebounce } from '~/hooks/use-debounce';
import useMapQueryDataToRows from '~/hooks/use-map-query-data-to-rows';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { getInitialSortColumns } from '~/modules/common/data-table/init-sort-columns';
import { useColumns } from '~/modules/system/requests-table/columns';
import { RequestsTableRoute } from '~/routes/system';
import type { Request } from '~/types';

import ColumnsView from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { FocusView } from '~/modules/common/focus-view';

type RequestsSearch = z.infer<typeof getRequestsQuerySchema>;

export const requestsQueryOptions = ({
  q,
  sort: initialSort,
  order: initialOrder,
  limit = LIMIT,
  rowsLength = 0,
}: GetRequestsParams & {
  rowsLength?: number;
}) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['requests', q, sort, order],
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) =>
      await getRequests(
        {
          page,
          q,
          sort,
          order,
          // Fetch more items than the limit if some items were deleted
          limit: limit + Math.max(page * limit - rowsLength, 0),
          // If some items were added, offset should be undefined, otherwise it should be the length of the rows
          offset: rowsLength - page * limit > 0 ? undefined : rowsLength,
        },
        signal,
      ),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

const LIMIT = 40;

const RequestsTable = () => {
  const search = useSearch({ from: RequestsTableRoute.id });
  const { t } = useTranslation();
  const [rows, setRows] = useState<Request[]>([]);
  const [query, setQuery] = useState<RequestsSearch['q']>(search.q);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // Search query options
  const q = useDebounce(query, 200);
  const sort = sortColumns[0]?.columnKey as RequestsSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as RequestsSearch['order'];
  const limit = LIMIT;

  const isFiltered = !!q;

  // Query organizations
  const queryResult = useSuspenseInfiniteQuery(requestsQueryOptions({ q, sort, order, limit, rowsLength: rows.length }));

  // Total count
  const totalCount = queryResult.data?.pages[0].total;

  const onSearch = (searchString: string) => {
    setQuery(searchString);
  };

  // Build columns
  const [columns, setColumns] = useColumns();

  // Map (updated) query data to rows
  useMapQueryDataToRows<Request>({ queryResult, setRows });

  // Save filters in search params
  const filters = useMemo(
    () => ({
      q,
      sort: sortColumns[0]?.columnKey,
      order: sortColumns[0]?.direction.toLowerCase(),
    }),
    [q, sortColumns],
  );
  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  const onRowsChange = async (changedRows: Request[]) => {
    setRows(changedRows);
  };

  const onResetFilters = () => {
    setQuery('');
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className={'flex items-center max-sm:justify-between md:gap-2'}>
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            <TableCount count={totalCount} type="request" isFiltered={isFiltered} onResetFilters={onResetFilters} />
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent>
            <TableSearch value={query} setQuery={onSearch} />
          </FilterBarContent>
        </TableFilterBar>
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
        <Export
          className="max-lg:hidden"
          filename={`${config.slug}-requests`}
          columns={columns}
          fetchRows={async (limit) => {
            const { items } = await getRequests({ limit, q: query, sort, order });
            return items;
          }}
        />
        <FocusView iconOnly />
      </div>
      <DataTable<Request>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          totalCount,
          rowHeight: 42,
          rowKeyGetter: (row) => row.id,
          error: queryResult.error,
          isLoading: queryResult.isLoading,
          isFetching: queryResult.isFetching,
          enableVirtualization: false,
          isFiltered,
          limit,
          onRowsChange,
          fetchMore: queryResult.fetchNextPage,
          sortColumns,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:requests').toLowerCase() })} />,
        }}
      />
    </div>
  );
};

export default RequestsTable;
