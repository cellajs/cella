import { InfiniteData, QueryKey, useInfiniteQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { getOrganizations } from '~/api/organizations';

import { SortColumn } from 'react-data-grid';
import { queryClient } from '~/router';
import { OrganizationsSearch, OrganizationsTableRoute } from '~/router/routeTree';
import { Organization } from '~/types';
import { DataTable } from '../../common/data-table';
import useSaveInSearchParams from '../../common/data-table/use-save-in-search-params';
import { useColumns } from './columns';
import Toolbar from './toolbar';

type QueryData = Awaited<ReturnType<typeof getOrganizations>>;

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

  const callback = (organizations: Organization[], action: 'create' | 'update' | 'delete') => {
    queryClient.setQueryData<InfiniteData<QueryData>>(['organizations', query, sortColumns], (data) => {
      if (!data) {
        return;
      }
      if (action === 'create') {
        return {
          pages: [
            {
              items: [...organizations, ...data.pages[0].items],
              total: data.pages[0].total + organizations.length,
            },
            ...data.pages.slice(1),
          ],
          pageParams: data.pageParams,
        };
      }

      if (action === 'update') {
        return {
          pages: [
            {
              items: data.pages[0].items.map((item) => {
                const organization = organizations.find((organization) => organization.id === item.id);
                if (item.id === organization?.id) {
                  return organization;
                }

                return item;
              }),
              total: data.pages[0].total,
            },
            ...data.pages.slice(1),
          ],
          pageParams: data.pageParams,
        };
      }

      if (action === 'delete') {
        return {
          pages: [
            {
              items: data.pages[0].items.filter((item) => !organizations.some((organization) => organization.id === item.id)),
              total: data.pages[0].total - 1,
            },
            ...data.pages.slice(1),
          ],
          pageParams: data.pageParams,
        };
      }
    });
  };

  const queryResult = useInfiniteQuery<QueryData, Error, InfiniteData<QueryData>, QueryKey, number>({
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
