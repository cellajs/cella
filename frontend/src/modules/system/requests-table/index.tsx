import { useInfiniteQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

import type { getRequestsQuerySchema } from 'backend/modules/requests/schema';
import { Bird } from 'lucide-react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { getRequests } from '~/api/requests';
import { useDebounce } from '~/hooks/use-debounce';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { RequestsTableRoute } from '~/routes/system';
import type { Request } from '~/types';
import useSaveInSearchParams from '../../../hooks/use-save-in-search-params';
import { DataTable } from '../../common/data-table';
import { useColumns } from './columns';
import Toolbar from './toolbar';
import { getInitialSortColumns } from '~/lib/utils';

export type RequestsSearch = z.infer<typeof getRequestsQuerySchema>;

const LIMIT = 40;

const RequestsTable = () => {
  const search = useSearch({ from: RequestsTableRoute.id });
  const { t } = useTranslation();
  const [rows, setRows] = useState<Request[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [query, setQuery] = useState<RequestsSearch['q']>(search.q);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  const debounceQuery = useDebounce(query, 300);

  // Save filters in search params
  const filters = useMemo(
    () => ({
      q: debounceQuery,
      sort: sortColumns[0]?.columnKey,
      order: sortColumns[0]?.direction.toLowerCase(),
    }),
    [debounceQuery, sortColumns],
  );

  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  const queryResult = useInfiniteQuery({
    queryKey: ['requests', debounceQuery, sortColumns],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const requestData = {
        page: pageParam,
        q: debounceQuery,
        sort: sortColumns[0]?.columnKey as RequestsSearch['sort'],
        order: sortColumns[0]?.direction.toLowerCase() as RequestsSearch['order'],
        limit: LIMIT,
      };

      const fetchedData = await getRequests(requestData, signal);
      return fetchedData;
    },
    getNextPageParam: (_lastGroup, groups) => groups.length,
    refetchOnWindowFocus: false,
  });

  const [columns, setColumns] = useColumns();

  const onRowsChange = async (records: Request[]) => {
    setRows(records);
  };

  const isFiltered = !!debounceQuery;

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
  };

  useEffect(() => {
    const data = queryResult.data?.pages?.flatMap((page) => page.items);

    if (data) {
      setSelectedRows(new Set<string>([...selectedRows].filter((id) => data.some((row) => row.id === id))));
      setRows(data);
    }
  }, [queryResult.data]);

  return (
    <div className="space-y-4 h-full">
      <Toolbar
        total={queryResult.data?.pages?.[0]?.total}
        query={query}
        setQuery={setQuery}
        isFiltered={isFiltered}
        selectedRequests={rows.filter((row) => selectedRows.has(row.id))}
        onResetFilters={onResetFilters}
        onResetSelectedRows={() => setSelectedRows(new Set<string>())}
        columns={columns}
        setColumns={setColumns}
        sort={sortColumns[0]?.columnKey as RequestsSearch['sort']}
        order={sortColumns[0]?.direction.toLowerCase() as RequestsSearch['order']}
      />
      <DataTable<Request>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          totalCount: queryResult.data?.pages[0].total,
          rowHeight: 42,
          rowKeyGetter: (row) => row.id,
          error: queryResult.error,
          isLoading: queryResult.isLoading,
          isFetching: queryResult.isFetching,
          enableVirtualization: false,
          isFiltered,
          limit: LIMIT,
          selectedRows,
          onRowsChange,
          fetchMore: queryResult.fetchNextPage,
          onSelectedRowsChange: setSelectedRows,
          sortColumns,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:requests').toLowerCase() })} />,
        }}
      />
    </div>
  );
};

export default RequestsTable;
