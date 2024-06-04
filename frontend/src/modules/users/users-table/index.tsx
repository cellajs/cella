import { useInfiniteQuery, infiniteQueryOptions } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { getUsers, type GetUsersParams, updateUser } from '~/api/users';
import type { User } from '~/types';

import type { getUsersQuerySchema } from 'backend/modules/users/schema';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useDebounce } from '~/hooks/use-debounce';
import { useMutateInfiniteQueryData } from '~/hooks/use-mutate-query-data';
import { DataTable } from '~/modules/common/data-table';
import { UsersTableRoute } from '~/routes/system';
import useSaveInSearchParams from '../../../hooks/use-save-in-search-params';
import { useColumns } from './columns';
import Toolbar from './toolbar';
import { useUserStore } from '~/store/user';

export type UsersSearch = z.infer<typeof getUsersQuerySchema>;

export const usersQueryOptions = ({ q, sort: initialSort, order: initialOrder, role }: GetUsersParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['users', q, sort, order, role],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const fetchedData = await getUsers(
        {
          page: pageParam,
          q,
          sort,
          order,
          role,
          limit: LIMIT,
        },
        signal,
      );

      return fetchedData;
    },
    getNextPageParam: (_lastPage, allPages) => allPages.length,
    refetchOnWindowFocus: false,
  });
};

const LIMIT = 40;

const UsersTable = () => {
  // Save filters in search params
  const search = useSearch({ from: UsersTableRoute.id });
  const { t } = useTranslation();
  const { user: currentUser } = useUserStore();

  const [rows, setRows] = useState<User[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [query, setQuery] = useState<UsersSearch['q']>(search.q);
  const [role, setRole] = useState<UsersSearch['role']>(search.role);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(
    search.sort && search.order
      ? [{ columnKey: search.sort, direction: search.order === 'asc' ? 'ASC' : 'DESC' }]
      : [{ columnKey: 'createdAt', direction: 'DESC' }],
  );

  const debounceQuery = useDebounce(query, 300);

  // Save filters in search params
  const filters = useMemo(
    () => ({
      q: debounceQuery,
      sort: sortColumns[0]?.columnKey,
      order: sortColumns[0]?.direction.toLowerCase(),
      role,
    }),
    [debounceQuery, role, sortColumns],
  );

  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  const callback = useMutateInfiniteQueryData(['users', debounceQuery, sortColumns, role]);

  const queryResult = useInfiniteQuery(
    usersQueryOptions({
      q: debounceQuery,
      sort: sortColumns[0]?.columnKey as UsersSearch['sort'],
      order: sortColumns[0]?.direction.toLowerCase() as UsersSearch['order'],
      role,
      limit: LIMIT,
    }),
  );
  const [columns, setColumns] = useColumns(callback);

  const isFiltered = role !== undefined || !!debounceQuery;

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
    setRole(undefined);
  };

  const onRowsChange = (changedRows: User[], { indexes, column }: RowsChangeData<User>) => {
    // mutate member
    for (const index of indexes) {
      if (column.key === 'role') {
        const user = changedRows[index];
        const isSelf = currentUser.id === user.id;
        if (isSelf) return toast.error(t('common:error.self_system_role'));
        updateUser(user.id, { role: user.role })
          .then(() => {
            callback([user], 'update');
            toast.success(t('common:success.user_role_updated'));
          })
          .catch((err) => {
            console.log(err);
            toast.error(t('common:error.error'));
          });
      }
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
      <DataTable<User>
        {...{
          columns: columns.filter((column) => column.visible),
          rowHeight: 42,
          enableVirtualization: false,
          onRowsChange,
          rows,
          limit: LIMIT,
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
