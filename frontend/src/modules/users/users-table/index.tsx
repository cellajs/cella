import { onlineManager } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { updateUser } from '~/api/users';

import type { usersQuerySchema } from 'backend/modules/users/schema';
import { config } from 'config';
import { motion } from 'framer-motion';
import { Mail, Trash, XSquare } from 'lucide-react';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { useDataFromSuspenseInfiniteQuery } from '~/hooks/use-data-from-query';
import { useMutateQueryData } from '~/hooks/use-mutate-query-data';
import { useMutation } from '~/hooks/use-mutations';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { showToast } from '~/lib/toasts';
import { DataTable } from '~/modules/common/data-table';
import ColumnsView from '~/modules/common/data-table/columns-view';
import { getInitialSortColumns } from '~/modules/common/data-table/sort-columns';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { openUserPreviewSheet } from '~/modules/common/data-table/util';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';
import SelectRole from '~/modules/common/form-fields/select-role';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import DeleteUsers from '~/modules/users/delete-users';
import InviteUsers from '~/modules/users/invite-users';
import { useColumns } from '~/modules/users/users-table/columns';
import { usersQueryOptions } from '~/modules/users/users-table/helpers/query-options';
import { UsersTableRoute } from '~/routes/system';
import type { User } from '~/types/common';

type UsersSearch = z.infer<typeof usersQuerySchema>;

const LIMIT = config.requestLimits.users;

type SystemRoles = (typeof config.rolesByType.systemRoles)[number] | undefined;

const UsersTable = () => {
  const { t } = useTranslation();

  const search = useSearch({ from: UsersTableRoute.id });
  const containerRef = useRef(null);

  // Table state
  const [q, setQuery] = useState<UsersSearch['q']>(search.q);
  const [role, setRole] = useState<UsersSearch['role']>(search.role);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // Search query options
  const sort = sortColumns[0]?.columnKey as UsersSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as UsersSearch['order'];
  const limit = LIMIT;

  // Check if there are active filters
  const isFiltered = role !== undefined || !!q;

  // Query users
  const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } = useDataFromSuspenseInfiniteQuery(
    usersQueryOptions({ q, sort, order, role, limit }),
  );

  // Save filters in search params
  const filters = useMemo(() => ({ q, sort, order, role }), [q, role, order, sort]);
  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  // Table selection
  const selectedUsers = useMemo(() => {
    return rows.filter((row) => selectedRows.has(row.id));
  }, [selectedRows, rows]);

  const mutateQuery = useMutateQueryData(['users', 'list'], (item) => ['user', item.id], ['update']);

  // Build columns
  const [columns, setColumns] = useColumns(mutateQuery.update);

  // Update user role
  const { mutate: updateUserRole } = useMutation({
    mutationFn: async (user: User) => await updateUser(user.id, { role: user.role }),
    onSuccess: (updatedUser) => {
      mutateQuery.update([updatedUser]);
      showToast(t('common:success.update_item', { item: t('common:role') }), 'success');
    },
    onError: () => showToast('Error updating role', 'error'),
  });

  // Reset filters
  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
    setRole(undefined);
  };

  // Drop selected Rows on search
  const onSearch = (searchString: string) => {
    if (selectedRows.size > 0) setSelectedRows(new Set<string>());
    setQuery(searchString);
  };

  // Change role filter
  const onRoleChange = (role?: string) => {
    setSelectedRows(new Set<string>());
    setRole(role === 'all' ? undefined : (role as SystemRoles));
  };

  // Update user role
  const onRowsChange = (changedRows: User[], { indexes, column }: RowsChangeData<User>) => {
    if (!onlineManager.isOnline()) return showToast(t('common:action.offline.text'), 'warning');

    for (const index of indexes) {
      if (column.key === 'role') updateUserRole(changedRows[index]);
    }
    setRows(changedRows);
  };

  const openInviteDialog = () => {
    dialog(<InviteUsers mode={'email'} dialog />, {
      id: 'user-invite',
      drawerOnMobile: false,
      className: 'w-auto shadow-none relative z-[60] max-w-4xl',
      container: containerRef.current,
      containerBackdrop: true,
      containerBackdropClassName: 'z-50',
      title: t('common:invite'),
      description: `${t('common:invite_users.text')}`,
    });
  };

  const openDeleteDialog = () => {
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

  // TODO: Figure out a way to open sheet using url state
  useEffect(() => {
    if (!search.userIdPreview) return;
    setTimeout(() => openUserPreviewSheet(search.userIdPreview as string), 0);
  }, []);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className={'flex items-center max-sm:justify-between md:gap-2'}>
        {/* Table filter bar */}
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {selectedUsers.length > 0 ? (
              <>
                <Button asChild variant="destructive" onClick={openDeleteDialog} className="relative">
                  <motion.button layout="size" layoutRoot transition={{ duration: 0.1 }} layoutId="members-filter-bar-button">
                    <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5 animate-in zoom-in">
                      {selectedUsers.length}
                    </Badge>
                    <motion.span layoutId="members-filter-bar-icon">
                      <Trash size={16} />
                    </motion.span>
                    <span className="ml-1 max-xs:hidden">{t('common:delete')}</span>
                  </motion.button>
                </Button>

                <Button asChild variant="ghost" onClick={() => setSelectedRows(new Set<string>())}>
                  <motion.button
                    transition={{
                      bounce: 0,
                      duration: 0.2,
                    }}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -20, opacity: 0 }}
                  >
                    <XSquare size={16} />
                    <span className="ml-1">{t('common:clear')}</span>{' '}
                  </motion.button>
                </Button>
              </>
            ) : (
              !isFiltered && (
                <Button asChild onClick={openInviteDialog}>
                  <motion.button transition={{ duration: 0.1 }} layoutId="members-filter-bar-button">
                    <motion.span layoutId="members-filter-bar-icon">
                      <Mail size={16} />
                    </motion.span>
                    <span className="ml-1">{t('common:invite')}</span>
                  </motion.button>
                </Button>
              )
            )}
            {!isLoading && selectedUsers.length === 0 && (
              <TableCount count={totalCount} type="member" isFiltered={isFiltered} onResetFilters={onResetFilters} />
            )}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-left max-sm:fade-in max-sm:duration-300">
            <TableSearch value={q} setQuery={onSearch} />
            <SelectRole value={role === undefined ? 'all' : role} onChange={onRoleChange} className="h-10 sm:min-w-32" />
          </FilterBarContent>
        </TableFilterBar>

        {/* Columns view */}
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

        {/* Focus view */}
        <FocusView iconOnly />
      </div>

      {/* Container for embedded dialog */}
      <div ref={containerRef} />

      {/* Table */}
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
