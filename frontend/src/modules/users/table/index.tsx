import { onlineManager, useInfiniteQuery } from '@tanstack/react-query';
import { appConfig } from 'config';
import { useCallback, useState } from 'react';
import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { toaster } from '~/modules/common/toaster/service';
import { usersQueryOptions, useUpdateUserMutation } from '~/modules/users/query';
import { useColumns } from '~/modules/users/table/columns';
import { UsersTableBar } from '~/modules/users/table/table-bar';
import type { TableUser } from '~/modules/users/types';
import { UsersTableRoute, type usersSearchSchema } from '~/routes/system';

const LIMIT = appConfig.requestLimits.users;

export type UsersSearch = z.infer<typeof usersSearchSchema>;

const UsersTable = () => {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<UsersSearch>({ from: UsersTableRoute.id });

  // Update user role
  const { mutate: updateUserRole } = useUpdateUserMutation();

  // Table state
  const { q, role, sort, order } = search;
  const limit = LIMIT;

  // Build columns
  const [selected, setSelected] = useState<TableUser[]>([]);
  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = usersQueryOptions({ ...search, limit });
  const {
    data: rows,
    isLoading,
    isFetching,
    error,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    ...queryOptions,
    select: ({ pages }) => pages.flatMap(({ items }) => items),
  });

  // Update user role
  const onRowsChange = (changedRows: TableUser[], { indexes, column }: RowsChangeData<TableUser>) => {
    if (column.key !== 'role') return;
    if (!onlineManager.isOnline()) {
      toaster(t('common:action.offline.text'), 'warning');
      return;
    }

    for (const index of indexes) {
      const newUser = changedRows[index];
      const updateInfo = { idOrSlug: newUser.id, role: newUser.role };
      updateUserRole(updateInfo, {
        onSuccess: () => toaster(t('common:success.update_item', { item: t('common:role') }), 'success'),
      });
    }
  };

  // isFetching already includes next page fetch scenario
  const fetchMore = useCallback(async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  }, [hasNextPage, isLoading, isFetching]);

  const onSelectedRowsChange = (value: Set<string>) => {
    if (rows) setSelected(rows.filter((row) => value.has(row.id)));
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <UsersTableBar
        queryKey={queryOptions.queryKey}
        selected={selected}
        searchVars={{ ...search, limit }}
        setSearch={setSearch}
        columns={columns}
        setColumns={setColumns}
        clearSelection={() => setSelected([])}
      />
      <DataTable<TableUser>
        {...{
          rows,
          rowHeight: 52,
          onRowsChange,
          rowKeyGetter: (row) => row.id,
          columns: columns.filter((column) => column.visible),
          enableVirtualization: false,
          limit,
          error,
          isLoading,
          isFetching,
          isFiltered: role !== undefined || !!q,
          hasNextPage,
          fetchMore,
          selectedRows: new Set(selected.map((s) => s.id)),
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
        }}
      />
    </div>
  );
};

export default UsersTable;
