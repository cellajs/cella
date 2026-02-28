import { onlineManager } from '@tanstack/react-query';
import { MailIcon, TrashIcon, XSquareIcon } from 'lucide-react';
import { useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { getMembers } from '~/api.gen';
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
import { toaster } from '~/modules/common/toaster/service';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { DeleteMemberships } from '~/modules/memberships/delete-memberships';
import type { MembersTableWrapperProps } from '~/modules/memberships/members-table/members-table';
import { PendingMembershipsCount } from '~/modules/memberships/pending-memberships-count';
import type { Member, MembersRouteSearchParams } from '~/modules/memberships/types';
import { InviteUsers } from '~/modules/user/invite-users';
import { useInfiniteQueryTotal } from '~/query/basic';

type MembersTableBarProps = MembersTableWrapperProps & BaseTableBarProps<Member, MembersRouteSearchParams>;

export const MembersTableBar = ({
  entity,
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

  const total = useInfiniteQueryTotal(queryKey);

  const deleteButtonRef = useRef(null);
  const inviteButtonRef = useRef(null);
  const inviteContainerRef = useRef(null);

  const { q, role, order, sort } = searchVars;

  const isFiltered = role !== undefined || !!q;
  // Check if user can update this context entity (and thus manage its members)
  const canUpdate = entity.can?.[entity.entityType]?.update ?? false;
  const entityType = entity.entityType;

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
        tenantId={entity.tenantId}
        orgId={entity.organizationId || entity.id}
        entityId={entity.id}
        entityType={entity.entityType}
        dialog
        members={selected}
        callback={clearSelection}
      />,
      {
        id: 'delete-memberships',
        triggerRef: deleteButtonRef,
        className: 'max-w-xl',
        title: t('common:remove_resource', { resource: t('common:members').toLowerCase() }),
        description: (
          <Trans
            t={t}
            i18nKey="common:confirm.remove_members"
            values={{
              entityType: entity.entityType,
              emails: selected.map((member) => member.email).join(', '),
            }}
          />
        ),
      },
    );
  };

  const openInviteDialog = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    createDialog(<InviteUsers entity={entity} mode={null} dialog />, {
      id: 'invite-users',
      triggerRef: inviteButtonRef,
      drawerOnMobile: false,
      className: 'w-auto shadow-none border relative z-60 max-w-4xl',
      container: { ref: inviteContainerRef, overlay: !isSheet },
      title: t('common:invite'),
      titleContent: <UnsavedBadge title={t('common:invite')} />,
      description: `${t('common:invite_members.text')}`,
    });
  };

  const fetchExport = async (limit: number) => {
    const { items } = await getMembers({
      query: {
        q,
        sort: sort || 'createdAt',
        order: order || 'asc',
        role,
        limit: String(limit),
        offset: '0',
        entityId: entity.id,
        entityType: entity.entityType,
      },
      path: { tenantId: entity.tenantId, orgId: entity.organizationId || entity.id },
    });
    return items;
  };

  return (
    <>
      <TableBarContainer searchVars={searchVars}>
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
                  label={entity.id ? 'common:remove' : 'common:delete'}
                />

                <TableBarButton variant="ghost" onClick={clearSelection} icon={XSquareIcon} label="common:clear" />
              </>
            ) : (
              !isFiltered &&
              canUpdate && (
                <TableBarButton
                  ref={inviteButtonRef}
                  icon={MailIcon}
                  label="common:invite"
                  onClick={() => openInviteDialog()}
                />
              )
            )}
            {selected.length === 0 && (
              <TableCount count={total} label="common:member" isFiltered={isFiltered} onResetFilters={onResetFilters}>
                {canUpdate && !isFiltered && <PendingMembershipsCount entity={entity} />}
              </TableCount>
            )}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarSearch>
            <TableSearch name="memberSearch" value={q} setQuery={onSearch} />
          </FilterBarSearch>
          {/* TODO-033 allow dropdowner here or a variantion of so it can be shown as drawer? perhaps combobox? */}
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
