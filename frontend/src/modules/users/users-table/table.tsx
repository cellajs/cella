import { onlineManager } from '@tanstack/react-query';
import { forwardRef, useImperativeHandle, useMemo } from 'react';
import { updateUser } from '~/api/users';

import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { useDataFromSuspenseInfiniteQuery } from '~/hooks/use-data-from-query';
import { useMutateQueryData } from '~/hooks/use-mutate-query-data';
import { useMutation } from '~/hooks/use-mutations';
import { showToast } from '~/lib/toasts';
import { DataTable } from '~/modules/common/data-table';
import { dialog } from '~/modules/common/dialoger/state';
import DeleteUsers from '~/modules/users/delete-users';
import InviteUsers from '~/modules/users/invite-users';
import { usersQueryOptions } from '~/modules/users/users-table/helpers/query-options';
import type { BaseTableProps, BaseTableQueryVariables, User } from '~/types/common';
import type { UsersSearch, UsersTableMethods } from '.';

type BaseUsersTableProps = BaseTableProps<User> & {
  queryVars: BaseTableQueryVariables<UsersSearch> & { role: UsersSearch['role'] };
};

const BaseUsersTable = forwardRef<UsersTableMethods, BaseUsersTableProps>(({ tableId, columns, sortColumns, setSortColumns, queryVars }, ref) => {
  const { t } = useTranslation();

  const { q, role, sort, order, limit } = queryVars;

  // Query users
  const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } = useDataFromSuspenseInfiniteQuery(
    usersQueryOptions({ q, sort, order, role, limit }),
  );

  // Table selection
  const selectedUsers = useMemo(() => {
    return rows.filter((row) => selectedRows.has(row.id));
  }, [selectedRows, rows]);

  const mutateQuery = useMutateQueryData(['users', 'list'], (item) => ['user', item.id], ['update']);

  // Update user role
  const { mutate: updateUserRole } = useMutation({
    mutationFn: async (user: User) => await updateUser(user.id, { role: user.role }),
    onSuccess: (updatedUser) => {
      mutateQuery.update([updatedUser]);
      showToast(t('common:success.update_item', { item: t('common:role') }), 'success');
    },
    onError: () => showToast('Error updating role', 'error'),
  });

  // Update user role
  const onRowsChange = (changedRows: User[], { indexes, column }: RowsChangeData<User>) => {
    if (!onlineManager.isOnline()) return showToast(t('common:action.offline.text'), 'warning');

    for (const index of indexes) if (column.key === 'role') updateUserRole(changedRows[index]);

    setRows(changedRows);
  };

  const openInviteDialog = (container: HTMLElement | null) => {
    dialog(<InviteUsers mode={'email'} dialog />, {
      id: 'user-invite',
      drawerOnMobile: false,
      className: 'w-auto shadow-none relative z-[60] max-w-4xl',
      container,
      containerBackdrop: true,
      containerBackdropClassName: 'z-50',
      title: t('common:invite'),
      description: `${t('common:invite_users.text')}`,
    });
  };

  const openRemoveDialog = () => {
    dialog(
      <DeleteUsers
        dialog
        users={selectedUsers}
        callback={(users) => {
          mutateQuery.remove(users);
          showToast(t('common:success.delete_resources', { resources: t('common:users') }), 'success');
        }}
      />,
      {
        drawerOnMobile: false,
        className: 'max-w-xl',
        title: t('common:delete'),
        description: t('common:confirm.delete_resource', {
          name: selectedUsers.map((u) => u.email).join(', '),
          resource: selectedUsers.length > 1 ? t('common:users').toLowerCase() : t('common:user').toLowerCase(),
        }),
      },
    );
  };

  // Expose methods via ref using useImperativeHandle
  useImperativeHandle(ref, () => ({
    clearSelection: () => setSelectedRows(new Set<string>()),
    openRemoveDialog,
    openInviteDialog,
  }));

  return (
    <div id={tableId} data-total-count={totalCount} data-selected={selectedUsers.length}>
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
    </div>
  );
});

export default BaseUsersTable;
