import { onlineManager } from '@tanstack/react-query';
import { Mail, Trash, XSquare } from 'lucide-react';
import { motion } from 'motion/react';
import { Trans, useTranslation } from 'react-i18next';
import { sort } from 'virtua/unstable_core';
import ColumnsView from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
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
import type { EntityPage } from '~/modules/entities/types';
import type { MemberSearch, MembersTableProps } from '~/modules/memberships/members-table/table-wrapper';
import { MembershipInvitations } from '~/modules/memberships/pending-table/invites-count';
import type { Member } from '~/modules/memberships/types';
import { organizationsKeys } from '~/modules/organizations/query';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import InviteUsers from '~/modules/users/invite-users';
import { queryClient } from '~/query/query-client';
import { nanoid } from '~/utils/nanoid';
import { getMembers } from '../api';
import { membersKeys } from '../query/options';
import RemoveMembersForm from '../remove-member-form';

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
        className: 'max-w-xl',
        title: t('common:remove_resource', { resource: t('common:member').toLowerCase() }),
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

    createDialog(<InviteUsers entity={entity} mode={null} dialog callback={handleNewInvites} />, {
      id: 'invite-users',
      drawerOnMobile: false,
      className: 'w-auto shadow-none relative z-60 max-w-4xl',
      container: { id: 'invite-users-container', overlay: true },
      title: t('common:invite'),
      titleContent: <UnsavedBadge title={t('common:invite')} />,
      description: `${t('common:invite_users.text')}`,
    });
  };

  const handleNewInvites = (emails: string[]) => {
    queryClient.setQueryData(organizationsKeys.single(entity.slug), (oldEntity: EntityPage) => {
      if (!oldEntity) return oldEntity;
      const newEntity = { ...oldEntity };
      if (newEntity.counts?.membership) newEntity.counts.membership.pending += emails.length;

      return newEntity;
    });
    queryClient.invalidateQueries({
      queryKey: membersKeys.invitesTable({ idOrSlug: entity.slug, entityType: entity.entity, orgIdOrSlug: entity.organizationId || entity.id }),
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
                <Button asChild variant="destructive" onClick={openDeleteDialog} className="relative">
                  <motion.button layout="size" layoutRoot transition={{ duration: 0.1 }} layoutId="members-filter-bar-button">
                    <Badge context="button">{selected.length}</Badge>
                    <motion.span layoutId="members-filter-bar-icon">
                      <Trash size={16} />
                    </motion.span>

                    <span className="ml-1 max-xs:hidden">{entity.id ? t('common:remove') : t('common:delete')}</span>
                  </motion.button>
                </Button>

                <Button asChild variant="ghost" onClick={clearSelection}>
                  <motion.button
                    transition={{ bounce: 0, duration: 0.2 }}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -20, opacity: 0 }}
                  >
                    <XSquare size={16} />
                    <span className="ml-1">{t('common:clear')}</span>
                  </motion.button>
                </Button>
              </>
            ) : (
              !isFiltered &&
              isAdmin && (
                //TODO mb rework sheet to find a way use dialog with ref in sheet
                <Button asChild onClick={() => openInviteDialog()}>
                  <motion.button transition={{ duration: 0.1 }} layoutId={nanoid()} initial={false}>
                    <motion.span>
                      <Mail size={16} />
                    </motion.span>
                    <span className="ml-1">{t('common:invite')}</span>
                  </motion.button>
                </Button>
              )
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
      <div id="invite-users-container" className="empty:hidden" />
    </div>
  );
};
