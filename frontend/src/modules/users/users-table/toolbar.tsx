import debounce from 'lodash.debounce';
import { ChangeEvent, Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { GetUsersParams } from '~/api/users';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import InviteUsersForm from '~/modules/users/invite-users-form';
import { useUserStore } from '~/store/user';
import { UserRow } from '.';
import ColumnsView, { ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import CountAndLoading from '../../common/data-table/count-and-loading';
import { dialog } from '../../common/dialoger/state';
import DeleteUser from '../delete-user';
import { User } from '~/types';

interface Props {
  total?: number;
  query?: string;
  setQuery?: (value: string) => void;
  callback: (users: User[], action: 'create' | 'update' | 'delete') => void;
  isFiltered?: boolean;
  role: GetUsersParams['role'];
  setRole: React.Dispatch<React.SetStateAction<GetUsersParams['role']>>;
  selectedUsers: User[];
  onResetFilters?: () => void;
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

function Toolbar({ selectedUsers, isFiltered, total, isLoading, role, setRole, onResetFilters, query, setQuery, columns, setColumns, callback }: Props) {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);

  const openInviteDialog = () => {
    dialog(<InviteUsersForm dialog />, {
      drawerOnMobile: false,
      className: 'max-w-xl',
      title: t('label.invite', {
        defaultValue: 'Invite',
      }),
      description: t('description.invite_users', {
        defaultValue: 'Invited users will receive an email with an invitation link.',
      }),
    });
  };

  const openDeleteUsersDialog = () => {
    dialog(<DeleteUser users={selectedUsers} callback={(users) => callback(users, 'delete')} dialog />, {
      drawerOnMobile: false,
      className: 'max-w-xl',
      title: t('label.delete', {
        defaultValue: 'Delete',
      }),
      description: t('description.delete_users', {
        defaultValue: 'Are you sure you want to delete the selected users?',
      }),
    });
  };

  return (
    <div className="items-center justify-between sm:flex">
      <div className="flex items-center space-x-2">
        {selectedUsers.length > 0 ? (
          <Button variant="destructive" className="relative" onClick={openDeleteUsersDialog}>
            <div className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-black px-1">
              <span className="text-xs font-medium text-white">{selectedUsers.length}</span>
            </div>
            {t('action.remove', {
              defaultValue: 'Remove',
            })}
          </Button>
        ) : (
          !isFiltered && (
            <>
              {user.role === 'ADMIN' && (
                <Button onClick={openInviteDialog}>
                  {t('action.invite', {
                    defaultValue: 'Invite',
                  })}
                </Button>
              )}
            </>
          )
        )}
        <CountAndLoading
          count={total}
          isLoading={isLoading}
          singular={t('label.singular_user', {
            defaultValue: 'user',
          })}
          plural={t('label.plural_users', {
            defaultValue: 'users',
          })}
          isFiltered={isFiltered}
          onResetFilters={onResetFilters}
        />
      </div>
      <div className="mt-2 flex items-center space-x-2 sm:mt-0">
        <Input
          placeholder={t('placeholder.search', {
            defaultValue: 'Search ...',
          })}
          defaultValue={query ?? ''}
          onChange={debounce((event: ChangeEvent<HTMLInputElement>) => {
            setQuery?.(event.target.value);
          }, 200)}
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
