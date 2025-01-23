import { onlineManager } from '@tanstack/react-query';
import { forwardRef, memo, useEffect, useImperativeHandle } from 'react';

import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { DataTable } from '~/modules/common/data-table';
import { createToast } from '~/modules/common/toaster';
import { usersKeys, usersQueryOptions } from '~/modules/users/query';
import type { UsersSearch } from '~/modules/users/table';
import { useDataFromSuspenseInfiniteQuery } from '~/query/hooks/use-data-from-query';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';
import type { BaseTableMethods, BaseTableProps, User } from '~/types/common';
import { useUpdateUserMutation } from '../query-mutations';

type BaseDataTableProps = BaseTableProps<User, UsersSearch> & {
  queryVars: { role: UsersSearch['role'] };
};

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ columns, queryVars, updateCounts, sortColumns, setSortColumns }, ref) => {
    const { t } = useTranslation();

    // Extract query variables and set defaults
    const { q, role, sort, order, limit } = queryVars;

    // Query users
    const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } =
      useDataFromSuspenseInfiniteQuery(usersQueryOptions({ q, sort, order, role, limit }));

    const mutateQuery = useMutateQueryData(usersKeys.list(), (item) => usersKeys.single(item.id), ['update']);

    // Update user role
    const { mutate: updateUserRole } = useUpdateUserMutation();

    // Update user role
    const onRowsChange = (changedRows: User[], { indexes, column }: RowsChangeData<User>) => {
      if (!onlineManager.isOnline()) return createToast(t('common:action.offline.text'), 'warning');
      for (const index of indexes)
        if (column.key === 'role') {
          const newUser = changedRows[index];
          const updateInfo = { idOrSlug: newUser.id, role: newUser.role };
          updateUserRole(updateInfo, {
            onSuccess: (updatedUser) => {
              mutateQuery.update([updatedUser]);
              createToast(t('common:success.update_item', { item: t('common:role') }), 'success');
            },
            onError: () => createToast('Error updating role', 'error'),
          });
        }
      setRows(changedRows);
    };

    useEffect(() => {
      updateCounts(
        rows.filter((row) => selectedRows.has(row.id)),
        totalCount,
      );
    }, [selectedRows, rows, totalCount]);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => setSelectedRows(new Set<string>()),
    }));

    return (
      <DataTable<User>
        {...{
          columns: columns.filter((column) => column.visible),
          rowHeight: 50,
          enableVirtualization: false,
          onRowsChange,
          rows,
          limit,
          totalCount,
          rowKeyGetter: (row) => row.id,
          error,
          isLoading,
          isFetching,
          fetchMore: fetchNextPage,
          isFiltered: role !== undefined || !!q,
          selectedRows,
          onSelectedRowsChange: setSelectedRows,
          sortColumns,
          onSortColumnsChange: setSortColumns,
        }}
      />
    );
  }),
);
export default BaseDataTable;
