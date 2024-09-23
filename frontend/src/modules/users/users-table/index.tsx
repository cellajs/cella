import { onlineManager, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { updateUser } from '~/api/users';

import type { usersQuerySchema } from 'backend/modules/users/schema';
import type { config } from 'config';
import { motion } from 'framer-motion';
import { Mail, Trash, XSquare } from 'lucide-react';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useDebounce } from '~/hooks/use-debounce';
import useMapQueryDataToRows from '~/hooks/use-map-query-data-to-rows';
import { useMutateInfiniteQueryData } from '~/hooks/use-mutate-query-data';
import { useMutation } from '~/hooks/use-mutations';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { showToast } from '~/lib/taosts-show';
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

const LIMIT = 100;

type SystemRoles = (typeof config.rolesByType.systemRoles)[number] | undefined;

const UsersTable = () => {
  const { t } = useTranslation();
  const search = useSearch({ from: UsersTableRoute.id });
  const containerRef = useRef(null);

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
  const queryResult = useSuspenseInfiniteQuery(usersQueryOptions({ q, sort, order, role, limit, rowsLength: rows.length }));

  // Total count
  const totalCount = queryResult.data?.pages[0].total;

  // Save filters in search params
  const filters = useMemo(
    () => ({
      q,
      sort,
      order,
      role,
    }),
    [q, role, order, sort],
  );
  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  // Map (updated) query data to rows
  useMapQueryDataToRows<User>({ queryResult, setSelectedRows, setRows, selectedRows });

  // Table selection
  const selectedUsers = useMemo(() => {
    return rows.filter((row) => selectedRows.has(row.id));
  }, [selectedRows, rows]);

  const callback = useMutateInfiniteQueryData(['users', q, sort, order, role], (item) => ['users', item.id]);

  // Build columns
  const [columns, setColumns] = useColumns(callback);

  // Update user role
  const { mutate: updateUserRole } = useMutation({
    mutationFn: async (user: User) => await updateUser(user.id, { role: user.role }),
    onSuccess: (updatedUser) => {
      callback([updatedUser], 'update');
      showToast(t('common:success.user_role_updated'), 'success');
    },
    onError: () => toast.error('Error updating role'),
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
    if (!onlineManager.isOnline()) return toast.warning(t('common:offline.text'));

    for (const index of indexes) {
      if (column.key === 'role') updateUserRole(changedRows[index]);
    }
    setRows(changedRows);
  };

  const openInviteDialog = () => {
    dialog(<InviteUsers mode={'email'} dialog />, {
      id: 'user-invite',
      drawerOnMobile: false,
      className: 'w-auto shadow-none relative z-[120] max-w-4xl',
      container: containerRef.current,
      title: t('common:invite'),
      text: `${t('common:invite_users.text')}`,
    });
  };

  const openDeleteDialog = () => {
    dialog(
      <DeleteUsers
        dialog
        users={selectedUsers}
        callback={(users) => {
          toast.success(t('common:success.delete_resources', { resources: t('common:users') }));
          callback(users, 'delete');
        }}
      />,
      {
        drawerOnMobile: false,
        className: 'max-w-xl',
        title: t('common:delete'),
        text: t('common:confirm.delete_resource', {
          name: selectedUsers.map((u) => u.email).join(', '),
          resource: selectedUsers.length > 1 ? t('common:users').toLowerCase() : t('common:user').toLowerCase(),
        }),
      },
    );
  };

  useEffect(() => {
    if (!rows.length || !search.userIdPreview) return;
    const user = rows.find((t) => t.id === search.userIdPreview);
    if (user) openUserPreviewSheet(user);
  }, [rows]);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className={'flex items-center max-sm:justify-between md:gap-2'}>
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
            {selectedUsers.length === 0 && <TableCount count={totalCount} type="member" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-left max-sm:fade-in max-sm:duration-300">
            <TableSearch value={query} setQuery={onSearch} />
            <SelectRole value={role === undefined ? 'all' : role} onChange={onRoleChange} className="h-10 sm:min-w-32" />
          </FilterBarContent>
        </TableFilterBar>

        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
        <FocusView iconOnly />
      </div>
      <div ref={containerRef} />
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
