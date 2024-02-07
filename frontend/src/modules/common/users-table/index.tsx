import { InfiniteData, QueryKey, useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useEffect, useState } from 'react';

import { GetUsersParams, getUsers } from '~/api/users';
import { User } from '~/types';

import { DataTable } from '~/modules/common/data-table';
import { queryClient } from '~/router';
import { UsersSearch, UsersTableRoute } from '~/router/routeTree';
import { useColumns } from './columns';
import Toolbar from './toolbar';
import Expand from './expand';

type QueryData = Awaited<ReturnType<typeof getUsers>>;

const UsersTable = () => {
  const [flatData, setFlatData] = useState<User[]>([]);
  const navigate = useNavigate();
  const [rowSelection, setRowSelection] = useState({});
  const search = useSearch({ from: UsersTableRoute.id });
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    search.q
      ? [
        {
          id: 'email',
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
  const [role, setRole] = useState<GetUsersParams['role']>(search.role ? (search.role as GetUsersParams['role']) : undefined);

  const callback = (user: User, action: 'create' | 'update' | 'delete') => {
    queryClient.setQueryData<InfiniteData<QueryData>>(['users', columnFilters, sorting, role], (data) => {
      if (!data) {
        return;
      }
      if (action === 'create') {
        return {
          pages: [
            {
              items: [
                {
                  ...user,
                  counts: {
                    ...user.counts,
                    memberships: 0,
                  },
                },
                ...data.pages[0].items,
              ],
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
                if (item.id === user.id) {
                  return {
                    ...user,
                    counts: {
                      ...user.counts,
                      ...item.counts,
                    },
                  };
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
              items: data.pages[0].items.filter((item) => item.id !== user.id),
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
    queryKey: ['users', columnFilters, sorting, role],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const fetchedData = await getUsers(
        {
          page: pageParam,
          q: columnFilters[0]?.value as string | undefined,
          sort: sorting[0]?.id as GetUsersParams['sort'],
          order: sorting[0]?.desc ? 'desc' : 'asc',
          role,
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
    getRowCanExpand: () => true,
    manualFiltering: true,
    manualSorting: true,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  const isFiltered = role !== undefined || table.getState().columnFilters.length > 0;

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
          q: columnFilters[0].value as UsersSearch['q'],
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
          sort: sorting[0].id as UsersSearch['sort'],
          order: sorting[0].desc ? 'desc' : 'asc',
        }),
      });
    } else {
      navigate({
        params: {},
        search: (prev) => ({ ...prev, sort: undefined, order: undefined }),
      });
    }
    if (role) {
      navigate({
        params: {},
        search: (prev) => ({
          ...prev,
          role,
        }),
      });
    } else {
      navigate({
        params: {},
        search: (prev) => ({ ...prev, role: undefined }),
      });
    }
  }, [columnFilters, sorting[0], role]);

  return (
    <DataTable<User>
      {...{
        // className: 'h-[500px]',
        table,
        queryResult,
        isFiltered,
        onResetFilters: () => {
          table.resetColumnFilters();
          table.resetRowSelection();
          setRole(undefined);
        },
        ToolbarComponent: (
          <Toolbar
            table={table}
            role={role}
            setRole={setRole}
            isFiltered={isFiltered}
            queryResult={queryResult}
            rowSelection={rowSelection}
          />
        ),
        renderExpandComponent: ({ row }) => <Expand row={row} />,
      }}
    />
  );
};

export default UsersTable;