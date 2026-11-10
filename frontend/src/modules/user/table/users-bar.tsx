import { useQuery } from '@tanstack/react-query';
import { TrashIcon, UserRoundPlusIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import type { TriggerRef } from '~/modules/common/dialoger/use-dialoger';
import { useRoleSearchFilter } from '~/modules/common/form-fields/use-role-search-filter';
import { NamedText } from '~/modules/common/named-text';
import { openDeleteDialog } from '~/modules/common/open-confirm';
import { DeleteUsers } from '~/modules/user/delete-users';
import { openInviteDialog } from '~/modules/user/invite-users';
import { pendingSystemInvitesQueryOptions } from '~/modules/user/query';
import type { BaseUser, UsersRouteSearchParams } from '~/modules/user/types';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

type UsersTableBarProps = BaseTableBarProps<BaseUser, UsersRouteSearchParams>;

export function UsersTableBar({ selected, queryKey, searchVars, setSearch, columns, setColumns, clearSelection }: UsersTableBarProps) {
  const { t } = useTranslation();

  const total = useListQueryTotal(queryKey);
  const pending = useQuery(pendingSystemInvitesQueryOptions()).data?.count ?? 0;

  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const inviteContainerRef = useRef<HTMLDivElement>(null);

  const { role, accounts } = searchVars;
  const barFilters = useTableBarFilters({ searchVars, setSearch, clearSelection, reset: { q: '', role: undefined, accounts: [] } });

  const roleFilters = useRoleSearchFilter({
    value: role,
    onChange: (role) => {
      clearSelection();
      setSearch({ role: role as UsersRouteSearchParams['role'] });
    },
  });

  // Anonymous accounts (a demo's, with no proven address) stay out until asked for; the one option switches them in.
  const includesAnonymous = accounts.includes('anonymous');
  const toggleAnonymous = () => {
    clearSelection();
    setSearch({ accounts: includesAnonymous ? [] : ['anonymous'] });
  };
  const anonymousOption = { value: 'anonymous', label: t('c:anonymous_accounts'), isSelected: includesAnonymous };
  const searchFilters = {
    groups: [...roleFilters.groups, { key: 'accounts', label: t('c:account'), options: [anonymousOption], onToggle: toggleAnonymous }],
    chips: [...roleFilters.chips, ...(includesAnonymous ? [{ key: 'anonymous', label: anonymousOption.label, onRemove: toggleAnonymous }] : [])],
  };

  const openInvite = (triggerRef: TriggerRef) =>
    openInviteDialog({ description: t('c:invite_users.text'), triggerRef, containerRef: inviteContainerRef });

  const confirmDelete = () =>
    openDeleteDialog({
      id: 'delete-users',
      triggerRef: deleteButtonRef,
      resource: 'c:user',
      count: selected.length,
      content: <DeleteUsers users={selected} callback={clearSelection} />,
      description: (
        <NamedText
          i18nKey="c:confirm.delete_resource"
          values={{
            name: selected.map((user) => user.email ?? user.name),
            resource: t('c:user', { count: selected.length }),
          }}
        />
      ),
    });

  return (
    <TableBarShell
      {...barFilters}
      {...{ searchVars, total, columns, setColumns }}
      label="c:user"
      searchName="userSearch"
      action={{ icon: UserRoundPlusIcon, label: t('c:invite'), onClick: openInvite }}
      countExtra={
        !barFilters.isFiltered &&
        pending > 0 && (
          <>
            <span aria-hidden className="text-faint-foreground">
              ·
            </span>
            <span className="text-muted-foreground shrink-0">{t('c:resource_count', { count: pending, resource: t('c:pending') })}</span>
          </>
        )
      }
      searchFilters={searchFilters}
      selection={{
        count: selected.length,
        onClear: clearSelection,
        children: <TableBarButton ref={deleteButtonRef} variant="destructive" onClick={confirmDelete} icon={TrashIcon} label="c:delete" />,
      }}
      after={<div ref={inviteContainerRef} className="empty:hidden" />}
    />
  );
}
