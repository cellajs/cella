import { Mail, Trash, XSquare } from 'lucide-react';
import { type Dispatch, type SetStateAction, useContext, useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type GetMembersParams, getMembersByOrganizationIdentifier } from '~/api/organizations';
import ColumnsView, { type ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';
import SelectRole from '~/modules/common/form-fields/select-role';
import InviteUsers from '~/modules/common/invite-users';
import { OrganizationContext } from '~/modules/organizations/organization';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';
import type { Member } from '~/types';
import type { MembersSearch } from '.';
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
  onResetFilters: () => void;
  onResetSelectedRows?: () => void;
  refetch?: () => void;
  columns: ColumnOrColumnGroup<Member>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<Member>[]>>;
  sort: MembersSearch['sort'];
  order: MembersSearch['order'];
}

const selectRoleOptions = [
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
    dialog(<InviteUsers organization={organization} dialog />, {
      drawerOnMobile: false,
      className: 'w-auto shadow-none relative z-[100] max-w-3xl',
      container: containerRef.current,
      title: t('common:invite'),
      text: `${t('common:invite_members.text')}`,
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

  const onRoleChange = (role?: string) => {
    setRole(role === 'all' ? undefined : (role as GetMembersParams['role']));
  };

  return (
    <>
      <div className={'flex items-center max-sm:justify-between md:gap-2'}>
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
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
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent>
            <TableSearch value={query} setQuery={setQuery} />
            <SelectRole roles={selectRoleOptions} value={role === undefined ? 'all' : role} onChange={onRoleChange} className="h-10 sm:min-w-32" />
          </FilterBarContent>
        </TableFilterBar>

        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

        <Export
          className="max-lg:hidden"
          filename={`${organization.slug}-members`}
          columns={columns}
          selectedRows={selectedMembers}
          fetchRows={async (limit) => {
            const { items } = await getMembersByOrganizationIdentifier(organization.id, { limit, role, q: query, sort, order });
            return items;
          }}
        />

        <FocusView iconOnly />
      </div>

      <div ref={containerRef} />
    </>
  );
}

export default Toolbar;
