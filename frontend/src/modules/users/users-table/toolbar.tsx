import { ChangeEvent, Dispatch, SetStateAction, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { GetUsersParams } from '~/api/users';
import InviteUsersForm from '~/modules/organizations/invite-users-form';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { useUserStore } from '~/store/user';
import { User } from '~/types';
import { UserRow } from '.';
import ColumnsView, { ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import CountAndLoading from '../../common/data-table/count-and-loading';
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
  onResetFilters?: () => void;
  onResetSelectedRows?: () => void;
  isLoading?: boolean;
  columns: ColumnOrColumnGroup<UserRow>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<UserRow>[]>>;
}

const items = [
  {
    key: 'all',
    value: 'All',
  },
  {
    key: 'admin',
    value: 'Admin',
  },
  {
    key: 'user',
    value: 'User',
  },
];

function Toolbar({
  selectedUsers,
  isFiltered,
  total,
  isLoading,
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
  const [queryValue, setQueryValue] = useState(query ?? '');

  const openInviteDialog = () => {
    dialog(<InviteUsersForm dialog />, {
      drawerOnMobile: false,
      className: 'max-w-xl',
      title: t('label.invite'),
      text: t('text.invite_users'),
    });
  };

  const openDeleteDialog = () => {
    dialog(
      <DeleteUsers
        users={selectedUsers}
        callback={(users) => {
          callback(users, 'delete');
          toast.success(t('success.delete_users'));
        }}
        dialog
      />,
      {
        drawerOnMobile: false,
        className: 'max-w-xl',
        title: t('label.delete'),
        text: t('text.delete_users'),
      },
    );
  };

  useEffect(() => {
    const delayQueryTimeoutId = setTimeout(() => {
      setQuery(queryValue || undefined);
    }, 200);
    return () => clearTimeout(delayQueryTimeoutId);
  }, [queryValue]);

  useEffect(() => {
    setQueryValue(query ?? '');
  }, [query]);

  return (
    <div className="items-center justify-between sm:flex">
      <div className="flex items-center space-x-2">
        {selectedUsers.length > 0 ? (
          <>
            <Button variant="destructive" className="relative" onClick={openDeleteDialog}>
              <div className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-black px-1">
                <span className="text-xs font-medium text-white">{selectedUsers.length}</span>
              </div>
              {t('action.remove')}
            </Button>
            <Button variant="secondary" onClick={onResetSelectedRows}>
              {t('action.clear')}
            </Button>
          </>
        ) : (
          !isFiltered && user.role === 'ADMIN' && <Button onClick={openInviteDialog}>{t('action.invite')}</Button>
        )}
        <CountAndLoading
          count={total}
          isLoading={isLoading}
          singular={t('label.singular_user')}
          plural={t('label.plural_users')}
          isFiltered={isFiltered}
          onResetFilters={onResetFilters}
        />
      </div>
      <div className="mt-2 flex items-center space-x-2 sm:mt-0">
        <Input
          placeholder={t('placeholder.search')}
          value={queryValue}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setQueryValue(event.target.value);
          }}
          className="h-10 w-[150px] lg:w-[250px]"
        />
        <Select
          onValueChange={(role) => {
            setRole(role === 'all' ? undefined : (role as GetUsersParams['role']));
          }}
          value={role === undefined ? 'all' : role}
        >
          <SelectTrigger className="h-10 w-[150px]">
            <SelectValue placeholder="Select a role" className="capitalize" />
          </SelectTrigger>
          <SelectContent>
            {items.map(({ key, value }) => (
              <SelectItem key={key} value={key} className="capitalize">
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ColumnsView columns={columns} setColumns={setColumns} />
      </div>
    </div>
  );
}

export default Toolbar;
