import { ChangeEvent, Dispatch, SetStateAction, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { GetMembersParams, getMembersByOrganizationIdentifier } from '~/api/organizations';
import { cn } from '~/lib/utils';
import Export from '~/modules/common/data-table/export';
import InviteUsersForm from '~/modules/organizations/invite-users-form';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { MembersSearch } from '~/router/routeTree';
import { useUserStore } from '~/store/user';
import { Member, Organization } from '~/types';
import ColumnsView, { ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import CountAndLoading from '../../common/data-table/count-and-loading';
import { dialog } from '../../common/dialoger/state';
import RemoveMembersForm from './remove-member-form';

interface Props {
  selectedMembers: Member[];
  total?: number;
  query?: string;
  setQuery: (value?: string) => void;
  organization: Organization;
  role: GetMembersParams['role'];
  callback: (members: Member[], action: 'update' | 'delete') => void;
  isFiltered?: boolean;
  setRole: React.Dispatch<React.SetStateAction<GetMembersParams['role']>>;
  onResetFilters?: () => void;
  onResetSelectedRows?: () => void;
  isLoading?: boolean;
  refetch?: () => void;
  columns: ColumnOrColumnGroup<Member>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<Member>[]>>;
  sort: MembersSearch['sort'];
  order: MembersSearch['order'];
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
    key: 'member',
    value: 'Member',
  },
];

function Toolbar({
  role,
  query,
  setQuery,
  setRole,
  organization,
  callback,
  isFiltered,
  selectedMembers,
  isLoading,
  onResetFilters,
  onResetSelectedRows,
  total,
  columns,
  setColumns,
  sort,
  order,
}: Props) {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);
  const [queryValue, setQueryValue] = useState(query ?? '');

  const openInviteDialog = () => {
    dialog(<InviteUsersForm organization={organization} dialog />, {
      drawerOnMobile: false,
      className: 'max-w-xl',
      title: t('common:invite'),
      text: t('common:text.invite_members'),
    });
  };

  const openRemoveDialog = () => {
    dialog(
      <RemoveMembersForm
        organization={organization}
        dialog
        callback={(members) => {
          callback(members, 'delete');
          toast.success(t('common:success.delete_members'));
        }}
        members={selectedMembers}
      />,
      {
        className: 'md:max-w-xl',
        title: t('common:remove_member'),
        text: (
          <Trans
            i18nKey="common:confirm.remove_members"
            values={{
              emails: selectedMembers.map((member) => member.email).join(', '),
            }}
            defaults="Are you sure you want to remove <strong>{{emails}}</strong> from the organization?"
          />
        ),
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
        {selectedMembers.length > 0 ? (
          <>
            <Button variant="destructive" className="relative" onClick={openRemoveDialog}>
              <div className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-black px-1">
                <span className="text-xs font-medium text-white">{selectedMembers.length}</span>
              </div>
              {t('common:remove')}
            </Button>
            <Button variant="secondary" onClick={onResetSelectedRows}>
              {t('common:clear')}
            </Button>
          </>
        ) : (
          !isFiltered &&
          (user.role === 'ADMIN' || organization.userRole === 'ADMIN') && <Button onClick={openInviteDialog}>{t('common:invite')}</Button>
        )}
        {selectedMembers.length === 0 && (
          <CountAndLoading
            count={total}
            isLoading={isLoading}
            singular={t('common:singular_member')}
            plural={t('common:plural_member')}
            isFiltered={isFiltered}
            onResetFilters={onResetFilters}
          />
        )}
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
            setRole(role === 'all' ? undefined : (role as GetMembersParams['role']));
          }}
          value={role === undefined ? 'all' : role}
        >
          <SelectTrigger className={cn('h-10 w-[125px]', role !== undefined && 'text-primary')}>
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent>
            {items.map(({ key, value }) => (
              <SelectItem key={key} value={key}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ColumnsView columns={columns} setColumns={setColumns} />
        <Export
          filename="members"
          columns={columns}
          selectedRows={selectedMembers}
          fetchRows={async (limit) => {
            const { items } = await getMembersByOrganizationIdentifier(organization.id, {
              limit,
              role,
              q: query,
              sort,
              order,
            });
            return items;
          }}
        />
      </div>
    </div>
  );
}

export default Toolbar;
