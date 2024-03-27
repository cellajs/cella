import { useInfiniteQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

import { getUsers, updateUser } from '~/api/users';
import type { User } from '~/types';

import type { RowsChangeData, SortColumn } from 'react-data-grid';
import useMutateQueryData from '~/hooks/use-mutate-query-data';
import { DataTable } from '~/modules/common/data-table';
import { toggleExpand } from '~/modules/common/data-table/toggle-expand';
import { UsersTableRoute } from '~/router/routeTree';
import useSaveInSearchParams from '../../../hooks/use-save-in-search-params';
import { useColumns } from './columns';
import Toolbar from './toolbar';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { getUsersQuerySchema } from 'backend/modules/users/schema';
import type { z } from 'zod';

// export type UserRow = (User & { type: 'MASTER'; expanded: boolean }) | { type: 'DETAIL'; id: string; parent: User };
export type UserRow = User & { type: 'MASTER' | 'DETAIL'; expanded?: boolean; parent?: User };

export type UsersSearch = z.infer<typeof getUsersQuerySchema>;

const UsersTable = () => {
  const search = useSearch({ from: UsersTableRoute.id });
  const { t } = useTranslation();

  const [rows, setRows] = useState<UserRow[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(
    search.sort && search.order
      ? [{ columnKey: search.sort, direction: search.order === 'asc' ? 'ASC' : 'DESC' }]
      : [{ columnKey: 'createdAt', direction: 'DESC' }],
  );
  const [query, setQuery] = useState<UsersSearch['q']>(search.q);
  const [role, setRole] = useState<UsersSearch['role']>(search.role);

  // Save filters in search params
  const filters = useMemo(
    () => ({
      q: query,
      sort: sortColumns[0]?.columnKey,
      order: sortColumns[0]?.direction.toLowerCase(),
      role,
    }),
    [query, role, sortColumns],
  );

  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

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

  const onRowsChange = (changedRows: UserRow[], { indexes, column }: RowsChangeData<UserRow>) => {
    const rows = toggleExpand(changedRows, indexes);

    // mutate member
    for (const index of indexes) {
      if (column.key === 'role') {
        const user = rows[index] as User;
        updateUser(user.id, { role: user.role })
          .then(() => {
            callback([user], 'update');
            toast.success(t('common:success.user_role_updated'));
          })
          .catch(() => {
            toast.error(t('common:error.error'));
          });
      }
    }

    setRows(rows);
  };

  useEffect(() => {
    const data = queryResult.data?.pages?.flatMap((page) => page.items);
    const rows = data?.map((item) => ({ ...item, type: 'MASTER' as const, expanded: false }));

    if (rows) {
      setSelectedRows(new Set<string>([...selectedRows].filter((id) => rows.some((row) => row.id === id))));
      setRows(rows);
    }
  }, [queryResult.data]);

  return (
    <div className="space-y-4 h-full">
      <Toolbar
        isFiltered={isFiltered}
        total={queryResult.data?.pages[0].total}
        query={query}
        callback={callback}
        setQuery={setQuery}
        onResetFilters={onResetFilters}
        onResetSelectedRows={() => setSelectedRows(new Set<string>())}
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
          totalCount: queryResult.data?.pages[0].total,
          rowKeyGetter: (row) => row.id,
          error: queryResult.error,
          isLoading: queryResult.isLoading,
          isFetching: queryResult.isFetching,
          fetchMore: queryResult.fetchNextPage,
          isFiltered,
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
