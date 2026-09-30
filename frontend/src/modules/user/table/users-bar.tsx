import { MailIcon, TrashIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { BaseTableBarProps, CallbackArgs } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { SelectRole } from '~/modules/common/form-fields/select-role';
import { toaster } from '~/modules/common/toaster/toaster';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { DeleteUsers } from '~/modules/user/delete-users';
import { InviteUsers } from '~/modules/user/invite-users';
import type { BaseUser, UsersRouteSearchParams } from '~/modules/user/types';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

type UsersTableBarProps = BaseTableBarProps<BaseUser, UsersRouteSearchParams>;

export function UsersTableBar({
  selected,
  queryKey,
  searchVars,
  setSearch,
  columns,
  setColumns,
  clearSelection,
}: UsersTableBarProps) {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);

  const total = useListQueryTotal(queryKey);

  const inviteButtonRef = useRef(null);
  const deleteButtonRef = useRef(null);
  const inviteContainerRef = useRef(null);

  const { role } = searchVars;
  const barFilters = useTableBarFilters({ searchVars, setSearch, clearSelection, reset: { q: '', role: undefined } });

  const onRoleChange = (role?: string) => {
    clearSelection();
    setSearch({ role: role === 'all' ? undefined : (role as UsersRouteSearchParams['role']) });
  };

  const openInviteDialog = () => {
    createDialog(<InviteUsers mode={'email'} dialog />, {
      id: 'invite-users',
      triggerRef: inviteButtonRef,
      drawerOnMobile: false,
      className: 'w-auto shadow-none border relative z-60 max-w-4xl',
      container: { ref: inviteContainerRef, overlay: true },
      title: t('c:invite'),
      titleContent: <UnsavedBadge title={t('c:invite')} />,
      description: `${t('c:invite_users.text')}`,
    });
  };

  const openDeleteDialog = () => {
    const callback = (args: CallbackArgs<BaseUser[]>) => {
      if (args.status === 'success') {
        const message =
          args.data.length === 1
            ? t('c:success.delete_resource', { resource: t('c:user') })
            : t('c:success.delete_counted_resources', {
                count: args.data.length,
                resources: t('c:user_other').toLowerCase(),
              });
        toaster.success(message);
      }
      clearSelection();
    };

    createDialog(<DeleteUsers dialog users={selected} callback={callback} />, {
      id: 'delete-users',
      triggerRef: deleteButtonRef,
      className: 'max-w-xl',
      title: t('c:delete'),
      description: t('c:confirm.delete_resource', {
        name: selected.map((u) => u.email).join(', '),
        resource: selected.length > 1 ? t('c:user_other').toLowerCase() : t('c:user').toLowerCase(),
      }),
    });
  };

  return (
    <TableBarShell
      {...barFilters}
      {...{ searchVars, total, columns, setColumns }}
      label="c:user"
      searchName="userSearch"
      actions={<TableBarButton ref={inviteButtonRef} icon={MailIcon} label="c:invite" onClick={openInviteDialog} />}
      filters={
        <SelectRole value={role === undefined ? 'all' : role} onChange={onRoleChange} className="h-10 sm:min-w-32" />
      }
      selection={{
        count: selected.length,
        onClear: clearSelection,
        children: (
          <TableBarButton
            ref={deleteButtonRef}
            variant="destructive"
            onClick={openDeleteDialog}
            icon={TrashIcon}
            label="c:delete"
          />
        ),
      }}
      // Container for the embedded invite dialog
      after={<div ref={inviteContainerRef} className="empty:hidden" />}
    />
  );
}
