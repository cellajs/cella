import { useInfiniteQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

import { getUsers } from '~/api/users';
import { User } from '~/types';

import { RowsChangeData, SortColumn } from 'react-data-grid';
import { DataTable } from '~/modules/common/data-table';
import { UsersSearch, UsersTableRoute } from '~/router/routeTree';
import useSaveInSearchParams from '../../../hooks/use-save-in-search-params';
import { useColumns } from './columns';
import Toolbar from './toolbar';
import useMutateQueryData from '~/hooks/use-mutate-query-data';

export type UserRow = (User & { type: 'MASTER'; expanded: boolean }) | { type: 'DETAIL'; id: string; parent: User };

const UsersTable = () => {
  const search = useSearch({ from: UsersTableRoute.id });

  const [rows, setRows] = useState<UserRow[]>([]);
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
  const [query, setQuery] = useState<UsersSearch['q']>(search.q);
  const [role, setRole] = useState<UsersSearch['role']>(search.role);

  // Save filters in search params
  const filters = useMemo(
    () => [
      { key: 'q', value: query },
      { key: 'sort', value: sortColumns[0]?.columnKey },
      { key: 'order', value: sortColumns[0]?.direction.toLowerCase() },
      { key: 'role', value: role },
    ],
    [query, role, sortColumns],
  );
  useSaveInSearchParams(filters);

  const callback = useMutateQueryData(['users', query, sortColumns, role]);

  const queryResult = useInfiniteQuery({
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

  return (
    <div className="space-y-4 h-full">
      <Toolbar
        isFiltered={isFiltered}
        total={queryResult.data?.pages[0].total}
        isLoading={queryResult.isFetching}
        query={query}
        callback={callback}
        setQuery={setQuery}
        onResetFilters={onResetFilters}
        role={role}
        selectedUsers={rows.filter((row) => selectedRows.has(row.id)) as User[]}
        setRole={setRole}
        columns={columns}
        setColumns={setColumns}
      />
      <DataTable<UserRow>
        {...{
          columns: columns.filter((column) => column.visible),
          rowHeight: 42,
          enableVirtualization: false,
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
