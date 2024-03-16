import debounce from 'lodash.debounce';
import { Mail, Trash, XSquare } from 'lucide-react';
import { useRef, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { GetUsersParams } from '~/api/users';
import InviteUsersForm from '~/modules/organizations/invite-users-form';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
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

  const containerRef = useRef(null);

  const openInviteDialog = () => {
    dialog(<InviteUsersForm dialog />, {
      drawerOnMobile: false,
      className: 'w-auto shadow-none relative z-[100] max-w-3xl',
      container: containerRef.current,
      title: t('common:invite'),
      text: `${t('common:invite_explanation.text')} ${t('common:invite_users.text')}`,
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

  return (
    <>
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
          {selectedUsers.length === 0 && <TableCount count={total} type="user" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
        </div>
        <div className="mt-2 flex items-center space-x-2 sm:mt-0">
          <Input
            className="h-10 w-[150px] lg:w-[250px]"
            placeholder={t('common:placeholder.search')}
            defaultValue={query}
            onChange={debounce((event: ChangeEvent<HTMLInputElement>) => {
              setQuery(event.target.value);
            }, 200)}
          />
          <Select
            value={role === undefined ? 'all' : role}
            onValueChange={(role) => {
              setRole(role === 'all' ? undefined : (role as GetUsersParams['role']));
            }}
          >
            <SelectTrigger className="h-10 w-[150px]">
              <SelectValue placeholder={t('common:placeholder.select_role')} />
            </SelectTrigger>
            <SelectContent>
              {items.map(({ key, value }) => (
                <SelectItem key={key} value={key}>
                  {t(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ColumnsView columns={columns} setColumns={setColumns} />
        </div>
      </div>

      <div ref={containerRef} />
    </>
  );
}

export default Toolbar;
