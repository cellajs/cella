import { onlineManager } from '@tanstack/react-query';
import { TrashIcon, UserRoundPlusIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import type { TriggerRef } from '~/modules/common/dialoger/use-dialoger';
import { useRoleSearchFilter } from '~/modules/common/form-fields/use-role-search-filter';
import { NamedText } from '~/modules/common/named-text';
import { openDeleteDialog } from '~/modules/common/open-confirm';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import { DeleteMemberships } from '~/modules/memberships/delete-memberships';
import type { MembersTableProps } from '~/modules/memberships/members-table/members-table';
import { PendingMembershipsCount } from '~/modules/memberships/pending-memberships-count';
import { fetchMembersForExport } from '~/modules/memberships/query';
import type { Member, MembersRouteSearchParams } from '~/modules/memberships/types';
import { openInviteDialog } from '~/modules/user/invite-users';
import type { PageRequest } from '~/query/basic/fetch-all-pages';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

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
  isSheet,
  canUpdate,
  clearSelection,
}: MembersTableBarProps) {
  const { t } = useTranslation();

  const total = useListQueryTotal(queryKey);

  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const inviteContainerRef = useRef<HTMLDivElement>(null);

  const { q, role, order, sort } = searchVars;
  const barFilters = useTableBarFilters({ searchVars, setSearch, clearSelection, reset: { q: '', role: undefined } });

  const organizationId = channelOrganizationId(channel);

  const searchFilters = useRoleSearchFilter({
    entityType: channel.entityType,
    value: role,
    onChange: (role) => {
      clearSelection();
      setSearch({ role: role as MembersRouteSearchParams['role'] });
    },
  });

  const confirmRemove = () =>
    openDeleteDialog({
      id: 'delete-memberships',
      triggerRef: deleteButtonRef,
      resource: 'c:member',
      count: selected.length,
      content: <DeleteMemberships channel={channel} members={selected} callback={clearSelection} />,
      title: t('c:remove_resource', { resource: t('c:member_other') }),
      description: (
        <NamedText
          i18nKey="c:confirm.remove_members"
          name={channel.name}
          values={{ emails: selected.map((member) => member.email ?? member.name) }}
        />
      ),
    });

  const openInvite = (triggerRef: TriggerRef) => {
    if (!onlineManager.isOnline()) return toastOffline();
    const description = <NamedText i18nKey="c:invite_members.text" name={channel.name} />;
    openInviteDialog({ channel, description, triggerRef, containerRef: inviteContainerRef });
  };

  const fetchExport = (page: PageRequest) => {
    const { id: entityId, entityType, tenantId } = channel;
    return fetchMembersForExport({ q, sort, order, role, entityId, entityType, tenantId, organizationId }, page);
  };

  return (
    <TableBarShell
      {...barFilters}
      {...{ searchVars, total, columns, setColumns }}
      label="c:member"
      searchName="memberSearch"
      action={canUpdate ? { icon: UserRoundPlusIcon, label: t('c:invite'), onClick: openInvite } : undefined}
      floatAction={!isSheet}
      countExtra={canUpdate && !barFilters.isFiltered && <PendingMembershipsCount channel={channel} />}
      searchFilters={searchFilters}
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
