import { Mail, Trash, XSquare } from 'lucide-react';
import { type Dispatch, type SetStateAction, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type GetMembersParams, getMembersByOrganizationIdentifier } from '~/api/organizations';
import { cn } from '~/lib/utils';
import Export from '~/modules/common/data-table/export';
import { FocusView } from '~/modules/common/focus-view';
import InviteUsers from '~/modules/common/invite-users';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { useUserStore } from '~/store/user';
import type { Member } from '~/types';
import type { MembersSearch } from '.';
import ColumnsView, { type ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import TableCount from '../../common/data-table/table-count';
import { dialog } from '../../common/dialoger/state';
import { OrganizationContext } from '../organization';
import RemoveMembersForm from './remove-member-form';
import TableSearch from '~/modules/common/data-table/table-search';
import { useSize } from '~/hooks/use-size';
import { Filter } from 'lucide-react';

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
  const windowSize = useSize();

  const [isFilterOpen, setFilterOpen] = useState<boolean>(role !== undefined || query !== undefined ? true : false);

  const [isButtonClicked, setButtonClicked] = useState<boolean>(role !== undefined || query !== undefined ? true : false);

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

  const onShowFilterClick = () => {
    setButtonClicked(true);
    setFilterOpen(true);
  };

  const onFiltersHideClick = () => {
    setButtonClicked(false);
    setFilterOpen(false);
    if (onResetFilters) onResetFilters();
  };

  const crossButton = useMemo(() => {
    if (windowSize.width < 640 && isFilterOpen) return <Button onClick={onFiltersHideClick}>X</Button>;
  }, [isFilterOpen, windowSize.width]);

  const filters = useMemo(() => {
    if (!isFilterOpen)
      return (
        <Button className="mt-0" onClick={onShowFilterClick}>
          <Filter width={16} height={16} />
          <span className="ml-1">Filter</span>
        </Button>
      );
    return (
      <>
        <TableSearch query={query} setQuery={setQuery} />
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
      </>
    );
  }, [isFilterOpen, query, role]);

  const isFiltersShown = useMemo(() => {
    return (windowSize.width < 640 && !isFilterOpen) || windowSize.width >= 640;
  }, [windowSize.width, isFilterOpen]);

  useEffect(() => {
    (() => {
      if (windowSize.width >= 640 && !isFilterOpen) {
        setFilterOpen(true);
        return;
      }
      if (windowSize.width < 640 && !isButtonClicked && isFilterOpen) {
        setFilterOpen(false);
        return;
      }
    })();
  }, [windowSize]);

  return (
    <>
      <div className={`items-center flex justify-${isFiltersShown ? 'between' : 'center'}`}>
        <div className={`${isFiltersShown ? 'flex' : 'hidden'} items-center space-x-2`}>
          {selectedMembers.length > 0 ? (
            <>
              <Button variant="destructive" onClick={openRemoveDialog} className="relative">
                <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedMembers.length}</Badge>
                <Trash size={16} />
                <span className="ml-1 max-xs:hidden">{t('common:remove')}</span>
              </Button>
              <Button variant="ghost" onClick={onResetSelectedRows}>
                <XSquare size={42} />
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
          {filters}
          {crossButton}
          <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
          <Export
            className="max-lg:hidden"
            filename={`${organization.slug}-members`}
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

          <FocusView iconOnly />
        </div>
      </div>

      <div ref={containerRef} />
    </>
  );
}

export default Toolbar;
