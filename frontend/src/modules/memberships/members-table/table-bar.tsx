import { onlineManager } from '@tanstack/react-query';
import { Mail, Trash, XSquare } from 'lucide-react';
import { useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { getMembers } from '~/api.gen';
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
import { toaster } from '~/modules/common/toaster/service';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import type { MemberSearch, MembersTableWrapperProps } from '~/modules/memberships/members-table/table-wrapper';
import { MembershipInvitations } from '~/modules/memberships/pending-table/invites-count';
import RemoveMembersForm from '~/modules/memberships/remove-member-form';
import type { Member } from '~/modules/memberships/types';
import InviteUsers from '~/modules/users/invite-users';
import { useInfiniteQueryTotal } from '~/query/hooks/use-infinite-query-total';

type MembersTableBarProps = MembersTableWrapperProps & BaseTableMethods & BaseTableBarProps<Member, MemberSearch>;

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

  const { q, role, order, sort } = searchVars;

  const isFiltered = role !== undefined || !!q;
  const isAdmin = entity.membership?.role === 'admin';
  const entityType = entity.entityType;

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
        entityType={entity.entityType}
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
      container: { id: 'invite-members-container', overlay: !isSheet },
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
        idOrSlug: entity.slug,
        entityType: entity.entityType,
      },
      path: { orgIdOrSlug: entity.organizationId || entity.id },
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
              <TableCount count={total} label="common:member" isFiltered={isFiltered} onResetFilters={onResetFilters}>
                {isAdmin && !isFiltered && <MembershipInvitations entity={entity} />}
              </TableCount>
            )}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-left max-sm:fade-in max-sm:duration-300">
            <TableSearch name="memberSearch" value={q} setQuery={onSearch} />
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
