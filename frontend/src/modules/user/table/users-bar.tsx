import { MailIcon, TrashIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import { SelectRole } from '~/modules/common/form-fields/select-role';
import { NamedText } from '~/modules/common/named-text';
import { openDeleteDialog } from '~/modules/common/open-confirm';
import { DeleteUsers } from '~/modules/user/delete-users';
import { openInviteDialog } from '~/modules/user/invite-users';
import type { BaseUser, UsersRouteSearchParams } from '~/modules/user/types';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

type UsersTableBarProps = BaseTableBarProps<BaseUser, UsersRouteSearchParams>;

export function UsersTableBar({ selected, queryKey, searchVars, setSearch, columns, setColumns, clearSelection }: UsersTableBarProps) {
  const { t } = useTranslation();

  const total = useListQueryTotal(queryKey);

  const inviteButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const inviteContainerRef = useRef<HTMLDivElement>(null);

  const { role } = searchVars;
  const barFilters = useTableBarFilters({ searchVars, setSearch, clearSelection, reset: { q: '', role: undefined } });

  const handleRoleChange = (role?: string) => {
    clearSelection();
    setSearch({ role: role as UsersRouteSearchParams['role'] });
  };

  const openInvite = () =>
    openInviteDialog({ mode: 'email', description: t('c:invite_users.text'), triggerRef: inviteButtonRef, containerRef: inviteContainerRef });

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
            name: selected.map((user) => user.email),
            resource: t('c:user', { count: selected.length }).toLowerCase(),
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
      actions={<TableBarButton ref={inviteButtonRef} icon={MailIcon} label="c:invite" onClick={openInvite} />}
      filters={<SelectRole value={role} onChange={handleRoleChange} className="h-10" />}
      selection={{
        count: selected.length,
        onClear: clearSelection,
        children: <TableBarButton ref={deleteButtonRef} variant="destructive" onClick={confirmDelete} icon={TrashIcon} label="c:delete" />,
      }}
      after={<div ref={inviteContainerRef} className="empty:hidden" />}
    />
  );
}
