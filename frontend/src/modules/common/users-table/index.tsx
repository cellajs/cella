import { InfiniteData, QueryKey, useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { getUsers } from '~/api/users';
import { User } from '~/types';

import { DataTable } from '~/modules/common/data-table';
import { queryClient } from '~/router';
import { UsersSearch, UsersTableRoute } from '~/router/routeTree';
import { useColumns } from './columns';
import Toolbar from './toolbar';
import { RowsChangeData, SortColumn } from 'react-data-grid';

export type UserRow = (User & { type: 'MASTER'; expanded: boolean }) | { type: 'DETAIL'; id: string; parent: User };

type QueryData = Awaited<ReturnType<typeof getUsers>>;

const UsersTable = () => {
  const navigate = useNavigate();
  const search = useSearch({ from: UsersTableRoute.id });

  const [rows, setRows] = useState<UserRow[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(
    search.sort && search.order ?
      [{
        columnKey: search.sort,
        direction: search.order === 'asc' ? 'ASC' : 'DESC',
      }] : [
        {
          columnKey: 'createdAt',
          direction: 'DESC',
        },
      ]);
  const [query, setQuery] = useState<UsersSearch['q']>(search.q);
  const [role, setRole] = useState<UsersSearch['role']>(search.role);

  const callback = (user: User, action: 'create' | 'update' | 'delete') => {
    queryClient.setQueryData<InfiniteData<QueryData>>(['users', query, sortColumns, role], (data) => {
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
    queryKey: ['users', query, sortColumns, role],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const fetchedData = await getUsers(
        {
          page: pageParam,
          q: query,
          sort: sortColumns[0]?.columnKey as UsersSearch['sort'],
          order: sortColumns[0]?.direction.toLowerCase() as UsersSearch['order'],
          role,
        },
        signal,
      );
      return fetchedData;
    },
    
    getNextPageParam: (_lastGroup, groups) => groups.length,
    refetchOnWindowFocus: false,
  });

  const [columns, setColumns] = useColumns(callback);

  const isFiltered = role !== undefined || !!query;

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
    setRole(undefined);
  };

  const onRowsChange = (changedRows: UserRow[], { indexes }: RowsChangeData<UserRow>) => {
    let rows = [...changedRows];
    const row = rows[indexes[0]];

    if (row.type === 'MASTER') {
      if (row.expanded) {
        const detailId = `${row.id}-detail`;
        rows.splice(indexes[0] + 1, 0, {
          type: 'DETAIL',
          id: detailId,
          parent: row,
        });

        // Close other masters
        rows = rows.map((r) => {
          if (r.type === 'MASTER' && r.id === row.id) {
            return r;
          }
          return {
            ...r,
            expanded: false,
          };
        });

        // Remove other details
        rows = rows.filter((r) => r.type === 'MASTER' || r.id === detailId);
      } else {
        rows.splice(indexes[0] + 1, 1);
      }

      setRows(rows);
    }
  };

  useEffect(() => {
    const data = queryResult.data?.pages?.flatMap((page) => page.items);
    const rows = data?.map((item) => ({ ...item, type: 'MASTER' as const, expanded: false }));

    if (rows) {
      setSelectedRows(new Set<string>());
      setRows(rows);
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
  }, [query, sortColumns[0]?.columnKey, role]);

  return (
    <div className='space-y-4 h-full'>
      <Toolbar
        isFiltered={isFiltered}
        total={queryResult.data?.pages[0].total}
        isLoading={queryResult.isFetching}
        query={query}
        setQuery={setQuery}
        onResetFilters={onResetFilters}
        role={role}
        selectedRows={selectedRows}
        setRole={setRole}
        columns={columns}
        setColumns={setColumns}
      />
      <DataTable<UserRow>
        {...{
          columns: columns.filter((column) => column.visible),
          rowHeight: (row) => (row.type === 'DETAIL' ? 100 : 32),
          onRowsChange,
          rows,
          rowKeyGetter: (row) => row.id,
          error: queryResult.error,
          isLoading: queryResult.isLoading,
          isFetching: queryResult.isFetching,
          fetchMore: queryResult.fetchNextPage,
          isFiltered,
          onResetFilters,
          selectedRows,
          onSelectedRowsChange: setSelectedRows,
          sortColumns,
          onSortColumnsChange: setSortColumns,
        }}
      />
    </div>
  );
};

export default UsersTable;