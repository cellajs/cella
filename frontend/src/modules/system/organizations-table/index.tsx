import { useInfiniteQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { getOrganizations } from '~/api/organizations';

import { SortColumn } from 'react-data-grid';
import { OrganizationsSearch, OrganizationsTableRoute } from '~/router/routeTree';
import { Organization } from '~/types';
import useSaveInSearchParams from '../../../hooks/use-save-in-search-params';
import { DataTable } from '../../common/data-table';
import { useColumns } from './columns';
import Toolbar from './toolbar';
import useMutateQueryData from '~/hooks/use-mutate-query-data';

const OrganizationsTable = () => {
  const search = useSearch({
    from: OrganizationsTableRoute.id,
  });

  const [rows, setRows] = useState<Organization[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(
    search.sort && search.order
      ? [
          {
            columnKey: search.sort,
            direction: search.order === 'asc' ? 'ASC' : 'DESC',
          },
        ]
      : [
          {
            columnKey: 'createdAt',
            direction: 'DESC',
          },
        ],
  );
  const [query, setQuery] = useState<OrganizationsSearch['q']>(search.q);

  // Save filters in search params
  const filters = useMemo(
    () => [
      { key: 'q', value: query },
      { key: 'sort', value: sortColumns[0]?.columnKey },
      { key: 'order', value: sortColumns[0]?.direction.toLowerCase() },
    ],
    [query, sortColumns],
  );
  useSaveInSearchParams(filters);

  const callback = useMutateQueryData(['organizations', query, sortColumns]);

  const queryResult = useInfiniteQuery({
    queryKey: ['organizations', query, sortColumns],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const fetchedData = await getOrganizations(
        {
          page: pageParam,
          q: query,
          sort: sortColumns[0]?.columnKey as OrganizationsSearch['sort'],
          order: sortColumns[0]?.direction.toLowerCase() as OrganizationsSearch['order'],
        },
        signal,
      );
      return fetchedData;
    },
    getNextPageParam: (_lastGroup, groups) => groups.length,
    refetchOnWindowFocus: false,
  });

  const [columns, setColumns] = useColumns(callback);

  const isFiltered = !!query;

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
  };

  useEffect(() => {
    const data = queryResult.data?.pages?.flatMap((page) => page.items);

    if (data) {
      setSelectedRows(new Set<string>());
      setRows(data);
    }
  }, [queryResult.data]);

  return (
    <div className="space-y-4 h-full">
      <Toolbar
        total={queryResult.data?.pages?.[0]?.total}
        isLoading={queryResult.isFetching}
        query={query}
        setQuery={setQuery}
        callback={callback}
        isFiltered={isFiltered}
        selectedOrganizations={rows.filter((row) => selectedRows.has(row.id))}
        onResetFilters={onResetFilters}
        columns={columns}
        setColumns={setColumns}
      />
      <DataTable<Organization>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          rowHeight: 42,
          rowKeyGetter: (row) => row.id,
          error: queryResult.error,
          isLoading: queryResult.isLoading,
          isFetching: queryResult.isFetching,
          enableVirtualization: false,
          isFiltered,
          onResetFilters,
          selectedRows,
          fetchMore: queryResult.fetchNextPage,
          onSelectedRowsChange: setSelectedRows,
          sortColumns,
          onSortColumnsChange: setSortColumns,
        }}
      />
    </div>
  );
};

export default OrganizationsTable;
