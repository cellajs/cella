import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import type { z } from 'zod';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { getInitialSortColumns } from '~/modules/common/data-table/sort-columns';

import { useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { useMutateQueryData } from '~/hooks/use-mutate-query-data';
import { openUserPreviewSheet } from '~/modules/common/data-table/util';
import type { usersQuerySchema } from '#/modules/users/schema';

import { useTranslation } from 'react-i18next';
import { showToast } from '~/lib/toasts';
import { dialog } from '~/modules/common/dialoger/state';
import DeleteUsers from '~/modules/users/delete-users';
import InviteUsers from '~/modules/users/invite-users';
import { useColumns } from '~/modules/users/users-table/columns';
import { UsersTableHeader } from '~/modules/users/users-table/table-header';
import { UsersTableRoute } from '~/routes/system';
import type { BaseTableMethods, User } from '~/types/common';
import { arraysHaveSameElements } from '~/utils';

const BaseUsersTable = lazy(() => import('~/modules/users/users-table/table'));
const LIMIT = config.requestLimits.users;

export type UsersSearch = z.infer<typeof usersQuerySchema>;

const UsersTable = () => {
  const { t } = useTranslation();
  const search = useSearch({ from: UsersTableRoute.id });
  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const [q, setQuery] = useState<UsersSearch['q']>(search.q);
  const [role, setRole] = useState<UsersSearch['role']>(search.role);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // State for selected and total counts
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<User[]>([]);

  // Update total and selected counts
  const updateCounts = (newSelected: User[], newTotal: number) => {
    if (newTotal !== total) setTotal(newTotal);
    if (!arraysHaveSameElements(selected, newSelected)) setSelected(newSelected);
  };

  // Search query options
  const sort = sortColumns[0]?.columnKey as UsersSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as UsersSearch['order'];
  const limit = LIMIT;

  // Save filters in search params
  const filters = useMemo(() => ({ q, sort, order, role }), [q, role, order, sort]);
  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  const mutateQuery = useMutateQueryData(['users', 'list'], (item) => ['user', item.id], ['update']);

  // Build columns
  const [columns, setColumns] = useColumns(mutateQuery.update);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
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
        users={selected}
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
          name: selected.map((u) => u.email).join(', '),
          resource: selected.length > 1 ? t('common:users').toLowerCase() : t('common:user').toLowerCase(),
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
      <UsersTableHeader
        total={total}
        selected={selected}
        q={q ?? ''}
        setQuery={setQuery}
        role={role}
        setRole={setRole}
        columns={columns}
        setColumns={setColumns}
        clearSelection={clearSelection}
        openRemoveDialog={openRemoveDialog}
        openInviteDialog={openInviteDialog}
      />
      <Suspense>
        <BaseUsersTable
          updateCounts={updateCounts}
          ref={dataTableRef}
          columns={columns}
          sortColumns={sortColumns}
          setSortColumns={setSortColumns}
          queryVars={{
            q,
            role,
            sort,
            order,
            limit,
          }}
        />
      </Suspense>
    </div>
  );
};

export default UsersTable;
