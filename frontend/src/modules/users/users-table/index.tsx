import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { type GetUsersParams, getUsers, updateUser } from '~/api/users';

import type { getUsersQuerySchema } from 'backend/modules/users/schema';
import type { config } from 'config';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useDebounce } from '~/hooks/use-debounce';
import { useMutateInfiniteQueryData } from '~/hooks/use-mutate-query-data';
import { useMutation } from '~/hooks/use-mutations';
import { DataTable } from '~/modules/common/data-table';
import { getInitialSortColumns } from '~/modules/common/data-table/init-sort-columns';
import { UsersTableRoute } from '~/routes/system';
import type { User } from '~/types';
import useSaveInSearchParams from '../../../hooks/use-save-in-search-params';
import { useColumns } from './columns';
import Toolbar from './toolbar';

type UsersSearch = z.infer<typeof getUsersQuerySchema>;

export const LIMIT = 40;

export const usersQueryOptions = ({ q, sort: initialSort, order: initialOrder, role, limit }: GetUsersParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['users', q, sort, order, role],
    initialPageParam: 0,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => await getUsers({ page, q, sort, order, role, limit }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

export type SystemRoles = (typeof config.rolesByType.systemRoles)[number] | undefined;

const UsersTable = () => {
  const { t } = useTranslation();
  const search = useSearch({ from: UsersTableRoute.id });

  const [rows, setRows] = useState<User[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [query, setQuery] = useState<UsersSearch['q']>(search.q);
  const [role, setRole] = useState<UsersSearch['role']>(search.role);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // Search query options
  const q = useDebounce(query, 200);
  const sort = sortColumns[0]?.columnKey as UsersSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as UsersSearch['order'];
  const limit = LIMIT;

  const isFiltered = role !== undefined || !!q;

  // Query users
  const queryResult = useInfiniteQuery(usersQueryOptions({ q, sort, order, role, limit }));

  // Total count
  const totalCount = queryResult.data?.pages[0].total;

  // Save filters in search params
  const filters = useMemo(
    () => ({
      q,
      sort: sortColumns[0]?.columnKey,
      order: sortColumns[0]?.direction.toLowerCase(),
      role,
    }),
    [q, role, sortColumns],
  );
  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  const callback = useMutateInfiniteQueryData([
    'users',
    q,
    sortColumns[0]?.columnKey as UsersSearch['sort'],
    sortColumns[0]?.direction.toLowerCase() as UsersSearch['order'],
    role,
  ]);

  const [columns, setColumns] = useColumns(callback);

  // Update user role
  const { mutate: updateUserRole } = useMutation({
    mutationFn: async (user: User) => await updateUser(user.id, { role: user.role }),
    onSuccess: (updatedUser) => {
      callback([updatedUser], 'update');
      toast.success(t('common:success:user_role_updated'));
    },
    onError: () => toast.error('Error updating role'),
  });

  // Reset filters
  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
    setRole(undefined);
  };

  // Change role filter
  const onRoleChange = (role?: string) => {
    setRole(role === 'all' ? undefined : (role as SystemRoles));
  };

  // Update user role
  const onRowsChange = (changedRows: User[], { indexes, column }: RowsChangeData<User>) => {
    for (const index of indexes) {
      if (column.key === 'role') updateUserRole(changedRows[index]);
    }
    setRows(changedRows);
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
        isFiltered={isFiltered}
        total={totalCount}
        query={query}
        setQuery={setQuery}
        onResetFilters={onResetFilters}
        onResetSelectedRows={() => setSelectedRows(new Set<string>())}
        role={role}
        onRoleChange={onRoleChange}
        selectedUsers={rows.filter((row) => selectedRows.has(row.id))}
        columns={columns}
        setColumns={setColumns}
        callback={callback}
      />

      <DataTable<User>
        {...{
          columns: columns.filter((column) => column.visible),
          rowHeight: 42,
          enableVirtualization: false,
          onRowsChange,
          rows,
          limit,
          totalCount,
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
