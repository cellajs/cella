import { onlineManager } from '@tanstack/react-query';
import { MailIcon, TrashIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { SelectRole } from '~/modules/common/form-fields/select-role';
import { NamedText } from '~/modules/common/named-text';
import { openDeleteDialog } from '~/modules/common/open-confirm';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import { DeleteMemberships } from '~/modules/memberships/delete-memberships';
import type { MembersTableProps } from '~/modules/memberships/members-table/members-table';
import { PendingMembershipsCount } from '~/modules/memberships/pending-memberships-count';
import { fetchMembersForExport } from '~/modules/memberships/query';
import type { Member, MembersRouteSearchParams } from '~/modules/memberships/types';
import { InviteUsers } from '~/modules/user/invite-users';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';
import { tw } from '~/utils/tw';

interface MembersTableBarProps extends MembersTableProps, BaseTableBarProps<Member, MembersRouteSearchParams> {
  canUpdate: boolean;
}

export function MembersTableBar({
  channel,
  selected,
  searchVars,
  setSearch,
  queryKey,
  columns,
  setColumns,
  isSheet = false,
  canUpdate,
  clearSelection,
}: MembersTableBarProps) {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);

  const total = useListQueryTotal(queryKey);

  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const inviteButtonRef = useRef<HTMLButtonElement>(null);
  const inviteContainerRef = useRef<HTMLDivElement>(null);

  const { q, role, order, sort } = searchVars;
  const barFilters = useTableBarFilters({ searchVars, setSearch, clearSelection, reset: { q: '', role: undefined } });

  const organizationId = channelOrganizationId(channel);

  const onRoleChange = (role?: string) => {
    clearSelection();
    setSearch({ role: role as MembersRouteSearchParams['role'] });
  };

  const confirmRemove = () =>
    openDeleteDialog({
      id: 'delete-memberships',
      triggerRef: deleteButtonRef,
      resource: 'c:member',
      count: selected.length,
      content: (
        <DeleteMemberships
          tenantId={channel.tenantId}
          organizationId={organizationId}
          entityId={channel.id}
          entityType={channel.entityType}
          members={selected}
          callback={clearSelection}
        />
      ),
      title: t('c:remove_resource', { resource: t('c:member_other').toLowerCase() }),
      description: <NamedText i18nKey="c:confirm.remove_members" name={channel.name} values={{ emails: selected.map((member) => member.email) }} />,
    });

  const openInviteDialog = () => {
    if (!onlineManager.isOnline()) return toastOffline();

    createDialog(<InviteUsers channel={channel} mode={null} dialog />, {
      id: 'invite-users',
      triggerRef: inviteButtonRef,
      drawerOnMobile: false,
      className: tw('w-auto max-w-4xl border shadow-none'),
      container: { ref: inviteContainerRef, overlay: true },
      title: t('c:invite'),
      titleContent: <UnsavedBadge title={t('c:invite')} />,
      description: <NamedText i18nKey="c:invite_members.text" name={channel.name} />,
    });
  };

  const fetchExport = (limit: number, offset: number) =>
    fetchMembersForExport({
      limit,
      offset,
      q,
      sort,
      order,
      role,
      entityId: channel.id,
      entityType: channel.entityType,
      tenantId: channel.tenantId,
      organizationId,
    });

  return (
    <TableBarShell
      {...barFilters}
      {...{ searchVars, total, columns, setColumns }}
      label="c:member"
      searchName="memberSearch"
      actions={canUpdate && <TableBarButton ref={inviteButtonRef} icon={MailIcon} label="c:invite" onClick={openInviteDialog} />}
      countExtra={canUpdate && !barFilters.isFiltered && <PendingMembershipsCount channel={channel} />}
      filters={<SelectRole entityType={channel.entityType} value={role} onChange={onRoleChange} />}
      // Export is gated like the other admin actions in this bar; row selection needs the same grant
      export={
        !isSheet && canUpdate ? { filename: `${appConfig.slug}-${channel.slug}-members`, selectedRows: selected, fetchRows: fetchExport } : undefined
      }
      focusView={!isSheet}
      selection={{
        count: selected.length,
        onClear: clearSelection,
        children: <TableBarButton ref={deleteButtonRef} variant="destructive" onClick={confirmRemove} icon={TrashIcon} label="c:remove" />,
      }}
      after={<div ref={inviteContainerRef} className="empty:hidden" />}
    />
  );
}
