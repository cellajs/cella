import { onlineManager } from '@tanstack/react-query';
import { Mail, Trash, XSquare } from 'lucide-react';
import { useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { sort } from 'virtua/unstable_core';
import ColumnsView from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps, BaseTableMethods } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
import SelectRole from '~/modules/common/form-fields/select-role';
import { toaster } from '~/modules/common/toaster';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import { getMembers } from '~/modules/memberships/api';
import type { MemberSearch, MembersTableProps } from '~/modules/memberships/members-table/table-wrapper';
import { MembershipInvitations } from '~/modules/memberships/pending-table/invites-count';
import RemoveMembersForm from '~/modules/memberships/remove-member-form';
import type { Member } from '~/modules/memberships/types';
import InviteUsers from '~/modules/users/invite-users';

type MembersTableBarProps = MembersTableProps & BaseTableMethods & BaseTableBarProps<Member, MemberSearch>;

export const MembersTableBar = ({
  entity,
  total,
  selected,
  searchVars,
  setSearch,
  columns,
  setColumns,
  isSheet = false,
  clearSelection,
}: MembersTableBarProps) => {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);

  const deleteButtonRef = useRef(null);
  const inviteButtonRef = useRef(null);

  const { q, role, order } = searchVars;

  const isFiltered = role !== undefined || !!q;
  const isAdmin = entity.membership?.role === 'admin';
  const entityType = entity.entity;

  // Clear selected rows on search
  const onSearch = (searchString: string) => {
    clearSelection();
    setSearch({ q: searchString });
  };

  // Clear selected rows on role change
  const onRoleChange = (role?: string) => {
    clearSelection();
    setSearch({ role: role === 'all' ? undefined : (role as MemberSearch['role']) });
  };

  const onResetFilters = () => {
    setSearch({ q: '', role: undefined });
    clearSelection();
  };

  const openDeleteDialog = () => {
    createDialog(
      <RemoveMembersForm
        organizationId={entity.organizationId || entity.id}
        entityIdOrSlug={entity.slug}
        entityType={entity.entity}
        dialog
        members={selected}
        callback={clearSelection}
      />,
      {
        id: 'remove-members',
        triggerRef: deleteButtonRef,
        className: 'max-w-xl',
        title: t('common:remove_resource', { resource: t('common:members').toLowerCase() }),
        description: (
          <Trans
            i18nKey="common:confirm.remove_members"
            values={{
              entity: entity.entity,
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
      // TODO(REFACTOR) handle container open in sheet
      ...(!isSheet && { container: { id: 'invite-members-container', overlay: true } }),
      title: t('common:invite'),
      titleContent: <UnsavedBadge title={t('common:invite')} />,
      description: `${t('common:invite_members.text')}`,
    });
  };

  const fetchExport = async (limit: number) => {
    const { items } = await getMembers({
      q,
      sort,
      order,
      role,
      limit,
      idOrSlug: entity.slug,
      orgIdOrSlug: entity.organizationId || entity.id,
      entityType: entity.entity,
    });
    return items;
  };

  return (
    <div>
      <TableBarContainer>
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
                  icon={Trash}
                  label={entity.id ? t('common:remove') : t('common:delete')}
                />

                <TableBarButton variant="ghost" onClick={clearSelection} icon={XSquare} label={t('common:clear')} />
              </>
            ) : (
              !isFiltered &&
              isAdmin && <TableBarButton ref={inviteButtonRef} icon={Mail} label={t('common:invite')} onClick={() => openInviteDialog()} />
            )}
            {selected.length === 0 && (
              <TableCount count={total} type="member" isFiltered={isFiltered} onResetFilters={onResetFilters}>
                {isAdmin && !isFiltered && <MembershipInvitations entity={entity} />}
              </TableCount>
            )}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-left max-sm:fade-in max-sm:duration-300">
            <TableSearch value={q} setQuery={onSearch} />
            <SelectRole entity value={role === undefined ? 'all' : role} onChange={onRoleChange} className="h-10 sm:min-w-32" />
          </FilterBarContent>
        </TableFilterBar>

        {/* Columns view dropdown */}
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

        {/* Export */}
        {!isSheet && (
          <Export className="max-lg:hidden" filename={`${entityType} members`} columns={columns} selectedRows={selected} fetchRows={fetchExport} />
        )}

        {/* Focus view */}
        {!isSheet && <FocusView iconOnly />}
      </TableBarContainer>

      {/* Container ref to embed dialog */}
      <div id="invite-members-container" className="empty:hidden" />
    </div>
  );
};
