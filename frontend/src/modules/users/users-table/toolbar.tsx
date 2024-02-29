import { Mail, Trash, XSquare } from 'lucide-react';
import { ChangeEvent, Dispatch, SetStateAction, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { GetUsersParams } from '~/api/users';
import InviteUsersForm from '~/modules/organizations/invite-users-form';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { useUserStore } from '~/store/user';
import { User } from '~/types';
import { UserRow } from '.';
import ColumnsView, { ColumnOrColumnGroup } from '../../common/data-table/columns-view';
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
  onResetFilters?: () => void;
  onResetSelectedRows?: () => void;
  columns: ColumnOrColumnGroup<UserRow>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<UserRow>[]>>;
}

const items = [
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
  const [queryValue, setQueryValue] = useState(query ?? '');

  const openInviteDialog = () => {
    dialog(<InviteUsersForm dialog />, {
      drawerOnMobile: false,
      className: 'max-w-xl',
      title: t('common:invite'),
      text: t('common:text.invite_users'),
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
        {selectedUsers.length === 0 && (
          <TableCount
            count={total}
            singular={t('common:singular_user')}
            plural={t('common:plural_users')}
            isFiltered={isFiltered}
            onResetFilters={onResetFilters}
          />
        )}
      </div>
      <div className="mt-2 flex items-center space-x-2 sm:mt-0">
        <Input
          className="h-10 w-[150px] lg:w-[250px]"
          placeholder={t('common:placeholder.search')}
          value={queryValue}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setQueryValue(event.target.value);
          }}
        />
        <Select
          value={role === undefined ? 'all' : role}
          onValueChange={(role) => {
            setRole(role === 'all' ? undefined : (role as GetUsersParams['role']));
          }}
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
