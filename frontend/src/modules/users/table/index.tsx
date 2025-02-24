import { useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { Suspense, lazy, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import { useUserSheet } from '~/hooks/use-user-sheet';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { BaseTableMethods } from '~/modules/common/data-table/types';
import { dialog } from '~/modules/common/dialoger/state';
import { toaster } from '~/modules/common/toaster';
import DeleteUsers from '~/modules/users/delete-users';
import InviteUsers from '~/modules/users/invite-users';
import { usersKeys } from '~/modules/users/query';
import { useColumns } from '~/modules/users/table/columns';
import { UsersTableBar } from '~/modules/users/table/table-bar';
import type { User } from '~/modules/users/types';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';
import { UsersTableRoute, type usersSearchSchema } from '~/routes/system';
import { arraysHaveSameElements } from '~/utils';

const BaseDataTable = lazy(() => import('~/modules/users/table/table'));
const LIMIT = config.requestLimits.users;

export type UsersSearch = z.infer<typeof usersSearchSchema>;

const UsersTable = () => {
  const { t } = useTranslation();

  const { search, setSearch } = useSearchParams<UsersSearch>({ from: UsersTableRoute.id });
  const { sheetId } = useSearch({ from: UsersTableRoute.id });

  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const { q, role, sort, order } = search;
  const limit = LIMIT;

  // State for selected and total counts
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<User[]>([]);

  // Update total and selected counts
  const updateCounts = (newSelected: User[], newTotal: number) => {
    if (newTotal !== total) setTotal(newTotal);
    if (!arraysHaveSameElements(selected, newSelected)) setSelected(newSelected);
  };

  const mutateQuery = useMutateQueryData(usersKeys.list(), (item) => usersKeys.single(item.id), ['update']);

  // Build columns
  const [columns, setColumns] = useColumns(mutateQuery.update);
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  // Render user sheet if sheetId is present
  useUserSheet({ sheetId });

  const openInviteDialog = (container: HTMLElement | null) => {
    dialog(<InviteUsers mode={'email'} dialog />, {
      id: 'user-invite',
      drawerOnMobile: false,
      className: 'w-auto shadow-none relative z-60 max-w-4xl',
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
          toaster(t('common:success.delete_resources', { resources: t('common:users') }), 'success');
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

  return (
    <div className="flex flex-col gap-4 h-full">
      <UsersTableBar
        total={total}
        selected={selected}
        q={q ?? ''}
        role={role}
        setSearch={setSearch}
        columns={columns}
        setColumns={setColumns}
        clearSelection={clearSelection}
        openRemoveDialog={openRemoveDialog}
        openInviteDialog={openInviteDialog}
      />
      <Suspense>
        <BaseDataTable
          updateCounts={updateCounts}
          ref={dataTableRef}
          columns={columns}
          queryVars={{ q, role, sort, order, limit }}
          sortColumns={sortColumns}
          setSortColumns={setSortColumns}
        />
      </Suspense>
    </div>
  );
};

export default UsersTable;
