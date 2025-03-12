import { config } from 'config';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { BaseTableMethods } from '~/modules/common/data-table/types';
import { dialog } from '~/modules/common/dialoger/state';
import { toaster } from '~/modules/common/toaster';
import DeleteUsers from '~/modules/users/delete-users';
import InviteUsers from '~/modules/users/invite-users';
import { usersKeys } from '~/modules/users/query';
import { useColumns } from '~/modules/users/table/columns';
import BaseDataTable from '~/modules/users/table/table';
import { UsersTableBar } from '~/modules/users/table/table-bar';
import type { User } from '~/modules/users/types';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';
import { UsersTableRoute, type usersSearchSchema } from '~/routes/system';

const LIMIT = config.requestLimits.users;

export type UsersSearch = z.infer<typeof usersSearchSchema>;

const UsersTable = () => {
  const { t } = useTranslation();

  const { search, setSearch } = useSearchParams<UsersSearch>({ from: UsersTableRoute.id });
  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const { q, role, sort, order } = search;
  const limit = LIMIT;

  const mutateQuery = useMutateQueryData(usersKeys.list(), (item) => usersKeys.single(item.id), ['update']);

  // State for selected and total counts
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<User[]>([]);

  // Build columns
  const [columns, setColumns] = useColumns(mutateQuery.update);
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

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
          clearSelection();
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
      <BaseDataTable
        ref={dataTableRef}
        columns={columns}
        queryVars={{ q, role, sort, order, limit }}
        sortColumns={sortColumns}
        setSortColumns={setSortColumns}
        setTotal={setTotal}
        setSelected={setSelected}
      />
    </div>
  );
};

export default UsersTable;
