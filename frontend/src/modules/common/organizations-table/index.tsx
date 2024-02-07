import { InfiniteData, QueryKey, useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ColumnFiltersState, SortingState, VisibilityState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import { getOrganizations } from '~/api/organizations';

import { queryClient } from '~/router';
import { OrganizationsSearch, OrganizationsTableRoute } from '~/router/routeTree';
import { Organization } from '~/types';
import { DataTable } from '../data-table';
import { useColumns } from './columns';
import Toolbar from './toolbar';

type QueryData = Awaited<ReturnType<typeof getOrganizations>>;

const OrganizationsTable = () => {
  const search = useSearch({
    from: OrganizationsTableRoute.id,
  });
  const navigate = useNavigate();
  const [flatData, setFlatData] = useState<Organization[]>([]);
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    search.q
      ? [
          {
            id: 'name',
            value: search.q,
          },
        ]
      : [],
  );
  const [sorting, setSorting] = useState<SortingState>(
    search.sort
      ? [
          {
            id: search.sort,
            desc: search.order === 'desc',
          },
        ]
      : [],
  );

  const callback = (organization: Organization, action: 'create' | 'update' | 'delete') => {
    queryClient.setQueryData<InfiniteData<QueryData>>(['organizations', columnFilters, sorting], (data) => {
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
    queryKey: ['organizations', columnFilters, sorting],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const fetchedData = await getOrganizations(
        {
          page: pageParam,
          q: columnFilters[0]?.value as string | undefined,
          sort: sorting[0]?.id as 'name' | 'id' | 'createdAt' | 'userRole' | undefined,
          order: sorting[0]?.desc ? 'desc' : 'asc',
        },
        signal,
      );
      return fetchedData;
    },
    getNextPageParam: (_lastGroup, groups) => groups.length,
    refetchOnWindowFocus: false,
  });

  const columns = useColumns(callback);

  const table = useReactTable({
    data: flatData,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    manualFiltering: true,
    manualSorting: true,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  });

  const isFiltered = table.getState().columnFilters.length > 0;

  useEffect(() => {
    const data = queryResult.data?.pages?.flatMap((page) => page.items);

    if (data) {
      setFlatData(data);
    }
  }, [queryResult.data]);

  useEffect(() => {
    if (columnFilters[0]) {
      navigate({
        params: {},
        search: (prev) => ({
          ...prev,
          q: columnFilters[0].value as OrganizationsSearch['q'],
        }),
      });
    } else {
      navigate({
        params: {},
        search: (prev) => ({ ...prev, q: undefined }),
      });
    }
    if (sorting[0]) {
      navigate({
        params: {},
        search: (prev) => ({
          ...prev,
          sort: sorting[0].id as OrganizationsSearch['sort'],
          order: sorting[0].desc ? 'desc' : 'asc',
        }),
      });
    } else {
      navigate({
        params: {},
        search: (prev) => ({ ...prev, sort: undefined, order: undefined }),
      });
    }
  }, [columnFilters, sorting[0]]);

  return (
    <DataTable
      {...{
        queryResult,
        table,
        isFiltered,
        onResetFilters: () => {
          table.resetColumnFilters();
          table.resetRowSelection();
        },
        ToolbarComponent: (
          <Toolbar table={table} callback={callback} isFiltered={isFiltered} queryResult={queryResult} rowSelection={rowSelection} />
        ),
      }}
    />
  );
};

export default OrganizationsTable;
