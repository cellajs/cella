import debounce from 'lodash.debounce';
import { Mail, Trash, XSquare } from 'lucide-react';
import { type ChangeEvent, type Dispatch, type SetStateAction, useContext, useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type GetMembersParams, getMembersByOrganizationIdentifier } from '~/api/organizations';
import { cn } from '~/lib/utils';
import Export from '~/modules/common/data-table/export';
import InviteUsersForm from '~/modules/organizations/invite-users-form';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import type { MembersSearch } from '~/router/routeTree';
import { useUserStore } from '~/store/user';
import type { Member } from '~/types';
import ColumnsView, { type ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import TableCount from '../../common/data-table/table-count';
import { dialog } from '../../common/dialoger/state';
import { OrganizationContext } from '../organization';
import RemoveMembersForm from './remove-member-form';

interface Props {
  selectedMembers: Member[];
  total?: number;
  query?: string;
  setQuery: (value?: string) => void;
  role: GetMembersParams['role'];
  callback: (members: Member[], action: 'update' | 'delete') => void;
  isFiltered?: boolean;
  setRole: React.Dispatch<React.SetStateAction<GetMembersParams['role']>>;
  onResetFilters?: () => void;
  onResetSelectedRows?: () => void;
  refetch?: () => void;
  columns: ColumnOrColumnGroup<Member>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<Member>[]>>;
  sort: MembersSearch['sort'];
  order: MembersSearch['order'];
}

const items = [
  { key: 'all', value: 'all' },
  { key: 'admin', value: 'admin' },
  { key: 'member', value: 'member' },
];

function Toolbar({
  role,
  query,
  setQuery,
  setRole,
  callback,
  isFiltered,
  selectedMembers,
  onResetFilters,
  onResetSelectedRows,
  total,
  columns,
  setColumns,
  sort,
  order,
}: Props) {
  const { t } = useTranslation();
  const { organization } = useContext(OrganizationContext);
  const user = useUserStore((state) => state.user);

  const containerRef = useRef(null);

  const openInviteDialog = () => {
    dialog(<InviteUsersForm organization={organization} dialog />, {
      drawerOnMobile: false,
      className: 'w-auto shadow-none relative z-[100] max-w-3xl',
      container: containerRef.current,
      title: t('common:invite'),
      text: `${t('common:invite_explanation.text')} ${t('common:invite_members.text')}`,
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
          />
        ),
      },
    );
  };

  return (
    <>
      <div className="items-center justify-between sm:flex">
        <div className="flex items-center space-x-2">
          {selectedMembers.length > 0 ? (
            <>
              <Button variant="destructive" onClick={openRemoveDialog} className="relative">
                <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedMembers.length}</Badge>
                <Trash size={16} />
                <span className="ml-1 max-xs:hidden">{t('common:remove')}</span>
              </Button>
              <Button variant="ghost" onClick={onResetSelectedRows}>
                <XSquare size={16} />
                <span className="ml-1">{t('common:clear')}</span>
              </Button>
            </>
          ) : (
            !isFiltered &&
            (user.role === 'ADMIN' || organization.userRole === 'ADMIN') && (
              <Button onClick={openInviteDialog}>
                <Mail size={16} />
                <span className="ml-1">{t('common:invite')}</span>
              </Button>
            )
          )}
          {selectedMembers.length === 0 && <TableCount count={total} type="member" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
        </div>
        <div className="mt-2 flex items-center space-x-2 sm:mt-0">
          <Input
            placeholder={t('common:placeholder.search')}
            defaultValue={query}
            onChange={debounce((event: ChangeEvent<HTMLInputElement>) => {
              setQuery(event.target.value);
            }, 200)}
            className="h-10 w-[150px] lg:w-[250px]"
          />
          <Select
            value={role === undefined ? 'all' : role}
            onValueChange={(role) => {
              setRole(role === 'all' ? undefined : (role as GetMembersParams['role']));
            }}
          >
            <SelectTrigger className={cn('h-10 w-[125px]', role !== undefined && 'text-primary')}>
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
          <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
          <Export
            className="max-lg:hidden"
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

      <div ref={containerRef} />
    </>
  );
}

export default Toolbar;
