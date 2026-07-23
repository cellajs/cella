import { onlineManager } from '@tanstack/react-query';
import { MailIcon, SquareXIcon, TrashIcon } from 'lucide-react';
import { useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { isUnconditionalCan } from 'shared';
import { ColumnsView } from '~/modules/common/data-table/columns-view';
import { Export } from '~/modules/common/data-table/export';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { TableCount } from '~/modules/common/data-table/table-count';
import {
  FilterBarActions,
  FilterBarFilters,
  FilterBarSearch,
  TableFilterBar,
} from '~/modules/common/data-table/table-filter-bar';
import { TableSearch } from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
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

export const MembersTableBar = ({
  channel,
  selected,
  searchVars,
  setSearch,
  queryKey,
  columns,
  setColumns,
  isSheet = false,
  clearSelection,
}: MembersTableBarProps) => {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);

  const total = useListQueryTotal(queryKey);

  const deleteButtonRef = useRef(null);
  const inviteButtonRef = useRef(null);
  const inviteContainerRef = useRef(null);

  const { q, role, order, sort } = searchVars;

  const isFiltered = role !== undefined || !!q;
  // Managing members is a channel-scoped affordance (not a per-row question), and the enriched
  // The entity has no `createdBy` for resolving `'own'`, so require an unconditional grant.
  const canUpdate = isUnconditionalCan(channel.can?.[channel.entityType]?.update);
  const entityType = channel.entityType;

  // Clear selected rows on search
  const onSearch = (searchString: string) => {
    clearSelection();
    setSearch({ q: searchString });
  };

  // Clear selected rows on role change
  const onRoleChange = (role?: string) => {
    clearSelection();
    setSearch({ role: role === 'all' ? undefined : (role as MembersRouteSearchParams['role']) });
  };

  const onResetFilters = () => {
    setSearch({ q: '', role: undefined });
    clearSelection();
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
    <>
      <TableBarContainer searchVars={searchVars} offsetTop={isSheet ? 0 : 48}>
        {/* Table Filter Bar */}
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {selected.length > 0 ? (
              <>
                <TableBarButton
                  ref={deleteButtonRef}
                  variant="destructive"
                  onClick={openDeleteDialog}
                  className="relative"
                  badge={selected.length}
                  icon={TrashIcon}
                  label={channel.id ? 'c:remove' : 'c:delete'}
                />

                <TableBarButton variant="ghost" onClick={clearSelection} icon={SquareXIcon} label="c:clear" />
              </>
            ) : (
              !isFiltered &&
              canUpdate && (
                <TableBarButton
                  ref={inviteButtonRef}
                  icon={MailIcon}
                  label="c:invite"
                  onClick={() => openInviteDialog()}
                />
              )
            )}
            {selected.length === 0 && (
              <TableCount count={total} label="c:member" isFiltered={isFiltered} onResetFilters={onResetFilters}>
                {canUpdate && !isFiltered && <PendingMembershipsCount channel={channel} />}
              </TableCount>
            )}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarSearch>
            <TableSearch name="memberSearch" value={q} setQuery={onSearch} />
          </FilterBarSearch>
          <FilterBarFilters>
            <SelectRole
              entity
              value={role === undefined ? 'all' : role}
              onChange={onRoleChange}
              className="h-10 w-auto sm:min-w-32"
            />
          </FilterBarFilters>
        </TableFilterBar>

        {/* Columns view dropdown */}
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

        {/* Export */}
        {!isSheet && (
          <Export
            className="max-lg:hidden"
            filename={`${entityType} members`}
            columns={columns}
            selectedRows={selected}
            fetchRows={fetchExport}
          />
        )}

        {/* Focus view */}
        {!isSheet && <FocusView iconOnly />}
      </TableBarContainer>

      {/* Container ref to embed dialog */}
      <div ref={inviteContainerRef} className="empty:hidden" />
    </>
  );
};
