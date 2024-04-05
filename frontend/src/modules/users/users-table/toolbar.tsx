import { Mail, Trash, XSquare } from 'lucide-react';
import { type Dispatch, type SetStateAction, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { GetUsersParams } from '~/api/users';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { FocusView } from '~/modules/common/focus-view';
import SelectRole from '~/modules/common/form-fields/select-role';
import InviteUsers from '~/modules/common/invite-users';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';
import type { User } from '~/types';
import type { UserRow } from '.';
import ColumnsView, { type ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import TableCount from '../../common/data-table/table-count';
import { dialog } from '../../common/dialoger/state';
import DeleteUsers from '../delete-users';

interface Props {
  total?: number;
  query?: string;
  setQuery: (value?: string) => void;
  callback: (users: User[], action: 'create' | 'update' | 'delete') => void;
  isFiltered?: boolean;
  role: GetUsersParams['role'];
  setRole: React.Dispatch<React.SetStateAction<GetUsersParams['role']>>;
  selectedUsers: User[];
  onResetFilters: () => void;
  onResetSelectedRows?: () => void;
  columns: ColumnOrColumnGroup<UserRow>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<UserRow>[]>>;
}

const selectRoleOptions = [
  { key: 'all', value: 'All' },
  { key: 'admin', value: 'Admin' },
  { key: 'user', value: 'User' },
];

function Toolbar({
  selectedUsers,
  isFiltered,
  total,
  role,
  setRole,
  onResetFilters,
  onResetSelectedRows,
  query,
  setQuery,
  columns,
  setColumns,
  callback,
}: Props) {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);

  const containerRef = useRef(null);

  const openInviteDialog = () => {
    dialog(<InviteUsers mode="email" dialog />, {
      drawerOnMobile: false,
      className: 'w-auto shadow-none relative z-[100] max-w-3xl',
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
          callback(users, 'delete');
          toast.success(t('common:success.delete_users'));
        }}
      />,
      {
        drawerOnMobile: false,
        className: 'max-w-xl',
        title: t('common:delete'),
        text: t('common:confirm.delete_users'),
      },
    );
  };

  const onRoleChange = (role?: string) => {
    setRole(role === 'all' ? undefined : (role as GetUsersParams['role']));
  };

  return (
    <>
      <div className={'flex items-center max-sm:justify-between md:gap-2'}>
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {selectedUsers.length > 0 ? (
              <>
                <Button variant="destructive" onClick={openDeleteDialog} className="relative">
                  <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedUsers.length}</Badge>
                  <Trash size={16} />
                  <span className="ml-1">{t('common:delete')}</span>
                </Button>
                <Button variant="ghost" onClick={onResetSelectedRows}>
                  <XSquare size={16} />
                  <span className="ml-1">{t('common:clear')}</span>
                </Button>
              </>
            ) : (
              !isFiltered &&
              user.role === 'ADMIN' && (
                <Button onClick={openInviteDialog}>
                  <Mail size={16} />
                  <span className="ml-1">{t('common:invite')}</span>
                </Button>
              )
            )}
            {selectedUsers.length === 0 && <TableCount count={total} type="user" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent>
            <TableSearch value={query} setQuery={setQuery} />
            <SelectRole roles={selectRoleOptions} value={role === undefined ? 'all' : role} onChange={onRoleChange} className="h-10 sm:min-w-32" />
          </FilterBarContent>
        </TableFilterBar>
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
        <FocusView iconOnly />
      </div>

      <div ref={containerRef} />
    </>
  );
}

export default Toolbar;
