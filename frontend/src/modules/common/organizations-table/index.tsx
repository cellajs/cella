import { InfiniteData, QueryKey, useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { getOrganizations } from '~/api/organizations';

import { queryClient } from '~/router';
import { OrganizationsSearch, OrganizationsTableRoute } from '~/router/routeTree';
import { Organization } from '~/types';
import { DataTable } from '../data-table';
import { useColumns } from './columns';
import Toolbar from './toolbar';
import { SortColumn } from 'react-data-grid';

type QueryData = Awaited<ReturnType<typeof getOrganizations>>;

const OrganizationsTable = () => {
  const search = useSearch({
    from: OrganizationsTableRoute.id,
  });
  const navigate = useNavigate();

  const [flatData, setFlatData] = useState<Organization[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(
    search.sort && search.order ?
      [{
        columnKey: search.sort,
        direction: search.order === 'asc' ? 'ASC' : 'DESC',
      }] : []);
  const [query, setQuery] = useState<OrganizationsSearch['q']>(search.q);

  const callback = (organization: Organization, action: 'create' | 'update' | 'delete') => {
    queryClient.setQueryData<InfiniteData<QueryData>>(['organizations', query, sortColumns], (data) => {
      if (!data) {
        return;
      }
      if (action === 'create') {
        return {
          pages: [
            {
              items: [organization, ...data.pages[0].items],
              total: data.pages[0].total + 1,
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
                if (item.id === organization.id) {
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
              items: data.pages[0].items.filter((item) => item.id !== organization.id),
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

  const columns = useColumns(callback);

  const isFiltered = !!query;

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
  };

  useEffect(() => {
    const data = queryResult.data?.pages?.flatMap((page) => page.items);

    if (data) {
      setFlatData(data);
    }
  }, [queryResult.data]);

  useEffect(() => {
    if (query) {
      navigate({
        params: {},
        search: (prev) => ({
          ...prev,
          q: query,
        }),
      });
    } else {
      navigate({
        params: {},
        search: (prev) => ({ ...prev, q: undefined }),
      });
    }
    if (sortColumns[0]) {
      navigate({
        params: {},
        search: (prev) => ({
          ...prev,
          sort: sortColumns[0].columnKey,
          order: sortColumns[0].direction.toLowerCase(),
        }),
      });
    } else {
      navigate({
        params: {},
        search: (prev) => ({ ...prev, sort: undefined, order: undefined }),
      });
    }
  }, [query, sortColumns[0]?.columnKey]);

  return (
    <DataTable<Organization>
      {...{
        columns,
        rows: flatData,
        rowKeyGetter: (row) => row.id,
        error: queryResult.error,
        isLoading: queryResult.isLoading,
        isFetching: queryResult.isFetching,
        isFiltered,
        onResetFilters,
        selectedRows,
        fetchMore: queryResult.fetchNextPage,
        onSelectedRowsChange: setSelectedRows,
        sortColumns,
        onSortColumnsChange: setSortColumns,
        ToolbarComponent: <Toolbar
          total={queryResult.data?.pages?.[0]?.total}
          query={query}
          setQuery={setQuery}
          callback={callback}
          isFiltered={isFiltered}
          onResetFilters={onResetFilters}
          setSelectedRows={setSelectedRows} />,
      }}
    />
  );
};

export default OrganizationsTable;
