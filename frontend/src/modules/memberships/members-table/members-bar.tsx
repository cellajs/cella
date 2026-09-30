import { onlineManager } from '@tanstack/react-query';
import { MailIcon, TrashIcon } from 'lucide-react';
import { useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { isUnconditionalCan } from 'shared';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { SelectRole } from '~/modules/common/form-fields/select-role';
import { toaster } from '~/modules/common/toaster/toaster';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { DeleteMemberships } from '~/modules/memberships/delete-memberships';
import type { MembersTableWrapperProps } from '~/modules/memberships/members-table/members-table';
import { PendingMembershipsCount } from '~/modules/memberships/pending-memberships-count';
import { fetchMembersForExport } from '~/modules/memberships/query';
import type { Member, MembersRouteSearchParams } from '~/modules/memberships/types';
import { InviteUsers } from '~/modules/user/invite-users';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

type MembersTableBarProps = MembersTableWrapperProps & BaseTableBarProps<Member, MembersRouteSearchParams>;

export function MembersTableBar({
  channel,
  selected,
  searchVars,
  setSearch,
  queryKey,
  columns,
  setColumns,
  isSheet = false,
  clearSelection,
}: MembersTableBarProps) {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);

  const total = useListQueryTotal(queryKey);

  const deleteButtonRef = useRef(null);
  const inviteButtonRef = useRef(null);
  const inviteContainerRef = useRef(null);

  const { q, role, order, sort } = searchVars;
  const barFilters = useTableBarFilters({ searchVars, setSearch, clearSelection, reset: { q: '', role: undefined } });

  const canUpdate = isUnconditionalCan(channel.can?.[channel.entityType]?.update);
  const entityType = channel.entityType;

  const onRoleChange = (role?: string) => {
    clearSelection();
    setSearch({ role: role === 'all' ? undefined : (role as MembersRouteSearchParams['role']) });
  };

  const openDeleteDialog = () => {
    createDialog(
      <DeleteMemberships
        tenantId={channel.tenantId}
        organizationId={channel.organizationId || channel.id}
        entityId={channel.id}
        entityType={channel.entityType}
        dialog
        members={selected}
        callback={clearSelection}
      />,
      {
        id: 'delete-memberships',
        triggerRef: deleteButtonRef,
        className: 'max-w-xl',
        title: t('c:remove_resource', { resource: t('c:member_other').toLowerCase() }),
        description: (
          <Trans
            t={t}
            i18nKey="c:confirm.remove_members"
            values={{
              entityType: channel.entityType,
              emails: selected.map((member) => member.email).join(', '),
            }}
          />
        ),
      },
    );
  };

  const openInviteDialog = () => {
    if (!onlineManager.isOnline()) return toaster.warning(t('c:action.offline.text'));

    createDialog(<InviteUsers channel={channel} mode={null} dialog />, {
      id: 'invite-users',
      triggerRef: inviteButtonRef,
      drawerOnMobile: false,
      className: 'w-auto shadow-none border relative z-60 max-w-4xl',
      container: { ref: inviteContainerRef, overlay: !isSheet },
      title: t('c:invite'),
      titleContent: <UnsavedBadge title={t('c:invite')} />,
      description: `${t('c:invite_members.text')}`,
    });
  };

  const fetchExport = async (limit: number, offset: number) => {
    return fetchMembersForExport({
      limit,
      offset,
      q,
      sort,
      order,
      role,
      entityId: channel.id,
      entityType: channel.entityType,
      tenantId: channel.tenantId,
      organizationId: channel.organizationId || channel.id,
    });
  };

  return (
    <TableBarShell
      {...barFilters}
      {...{ searchVars, total, columns, setColumns }}
      label="c:member"
      searchName="memberSearch"
      actions={
        canUpdate && (
          <TableBarButton ref={inviteButtonRef} icon={MailIcon} label="c:invite" onClick={openInviteDialog} />
        )
      }
      countExtra={canUpdate && !barFilters.isFiltered && <PendingMembershipsCount channel={channel} />}
      filters={
        <SelectRole
          entityType={channel.entityType}
          value={role === undefined ? 'all' : role}
          onChange={onRoleChange}
          className="h-10 w-auto sm:min-w-32"
        />
      }
      // Export is gated like the other admin actions in this bar; row selection needs the same grant
      export={
        !isSheet && canUpdate
          ? { filename: `${entityType} members`, selectedRows: selected, fetchRows: fetchExport }
          : undefined
      }
      focusView={!isSheet}
      selection={{
        count: selected.length,
        onClear: clearSelection,
        children: (
          <TableBarButton
            ref={deleteButtonRef}
            variant="destructive"
            onClick={openDeleteDialog}
            icon={TrashIcon}
            label={channel.id ? 'c:remove' : 'c:delete'}
          />
        ),
      }}
      after={<div ref={inviteContainerRef} className="empty:hidden" />}
    />
  );
}
