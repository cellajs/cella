import { onlineManager } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { config } from 'config';
import { motion } from 'framer-motion';
import { Mail, Trash, XSquare } from 'lucide-react';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { Trans, useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { getMembers } from '~/api/memberships';
import { useDataFromSuspenseInfiniteQuery } from '~/hooks/use-data-from-query';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { queryClient } from '~/lib/router';
import { showToast } from '~/lib/toasts';
import { DataTable } from '~/modules/common/data-table';
import ColumnsView from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import { getInitialSortColumns } from '~/modules/common/data-table/sort-columns';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { openUserPreviewSheet } from '~/modules/common/data-table/util';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';
import SelectRole from '~/modules/common/form-fields/select-role';
import { membersKeys } from '~/modules/common/query-client-provider/keys';
import { useMembersUpdateMutation } from '~/modules/common/query-client-provider/mutations/members';
import { useColumns } from '~/modules/organizations/members-table/columns';
import { membersQueryOptions } from '~/modules/organizations/members-table/helpers/query-options';
import RemoveMembersForm from '~/modules/organizations/members-table/remove-member-form';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import InviteUsers from '~/modules/users/invite-users';
import type { EntityPage, Member, MinimumMembershipInfo } from '~/types/common';
import type { membersQuerySchema } from '#/modules/general/schema';

type MemberSearch = z.infer<typeof membersQuerySchema>;

const LIMIT = config.requestLimits.members;

interface MembersTableProps {
  entity: EntityPage & { membership: MinimumMembershipInfo | null };
  isSheet?: boolean;
}

const MembersTable = ({ entity, isSheet = false }: MembersTableProps) => {
  const { t } = useTranslation();
  const containerRef = useRef(null);

  const search = useSearch({ strict: false });

  const entityType = entity.entity;
  const organizationId = entity.organizationId || entity.id;
  const isAdmin = entity.membership?.role === 'admin';

  // Table state
  const [q, setQuery] = useState<MemberSearch['q']>(search.q);
  const [role, setRole] = useState<MemberSearch['role']>(search.role as MemberSearch['role']);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // Search query options
  const sort = sortColumns[0]?.columnKey as MemberSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as MemberSearch['order'];
  const limit = LIMIT;

  // Check if there are active filters
  const isFiltered = role !== undefined || !!q;

  // Query members
  const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } = useDataFromSuspenseInfiniteQuery(
    membersQueryOptions({
      idOrSlug: entity.slug,
      entityType,
      orgIdOrSlug: organizationId,
      q,
      sort,
      order,
      role,
      limit,
    }),
  );

  // Save filters in search params
  if (!isSheet) {
    const filters = useMemo(() => ({ q, sort, order, role }), [q, role, sortColumns]);
    useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });
  }

  // Build columns
  const [columns, setColumns] = useColumns(isAdmin, isSheet, organizationId);

  // Table selection
  const selectedMembers = useMemo(() => {
    return rows.filter((row) => selectedRows.has(row.id));
  }, [selectedRows, rows]);

  const updateMemberMembership = useMembersUpdateMutation();

  // Reset filters
  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
    setRole(undefined);
  };

  // Drop selected rows on search
  const onSearch = (searchString: string) => {
    if (selectedRows.size > 0) setSelectedRows(new Set<string>());
    setQuery(searchString);
  };

  const onRoleChange = (role?: string) => {
    setSelectedRows(new Set<string>());
    setRole(role === 'all' ? undefined : (role as MemberSearch['role']));
  };

  // Update rows
  const onRowsChange = (changedRows: Member[], { indexes, column }: RowsChangeData<Member>) => {
    if (!onlineManager.isOnline()) return showToast(t('common:action.offline.text'), 'warning');

    if (column.key !== 'role') return setRows(changedRows);

    // If role is changed, update membership
    for (const index of indexes) {
      updateMemberMembership.mutateAsync(
        { ...changedRows[index].membership, orgIdOrSlug: organizationId, idOrSlug: entity.slug, entityType },
        {
          onSuccess(data, variables, context) {
            queryClient.getMutationDefaults(membersKeys.update()).onSuccess?.(data, variables, context);
            showToast(t('common:success.update_item', { item: t('common:role') }), 'success');
          },
          onError(error, variables, context) {
            queryClient.getMutationDefaults(membersKeys.update()).onError?.(error, variables, context);
            showToast('Error updating role', 'error');
          },
        },
      );
    }
    setRows(changedRows);
  };

  const fetchForExport = async (limit: number) => {
    const data = await getMembers({
      q,
      sort,
      order,
      role,
      limit,
      idOrSlug: entity.slug,
      orgIdOrSlug: organizationId,
      entityType,
    });
    return data.items;
  };

  const openInviteDialog = () => {
    dialog(<InviteUsers entity={entity} mode={null} dialog />, {
      id: `user-invite-${entity.id}`,
      drawerOnMobile: false,
      className: 'w-auto shadow-none relative z-[60] max-w-4xl',
      container: containerRef.current,
      containerBackdrop: true,
      containerBackdropClassName: 'z-50',
      title: t('common:invite'),
      description: `${t('common:invite_users.text')}`,
    });
  };

  // pass to dialog same identification witch fetch the query
  const openRemoveDialog = () => {
    dialog(
      <RemoveMembersForm organizationId={organizationId} entityIdOrSlug={entity.slug} entityType={entityType} dialog members={selectedMembers} />,
      {
        className: 'max-w-xl',
        title: t('common:remove_resource', { resource: t('common:member').toLowerCase() }),
        description: (
          <Trans
            i18nKey="common:confirm.remove_members"
            values={{
              entity: entityType,
              emails: selectedMembers.map((member) => member.email).join(', '),
            }}
          />
        ),
      },
    );
  };

  // TODO: Figure out a way to open sheet using url state
  useEffect(() => {
    if (!search.userIdPreview) return;
    setTimeout(() => openUserPreviewSheet(search.userIdPreview as string, organizationId), 0);
  }, []);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className={'flex items-center max-sm:justify-between md:gap-2'}>
        {/* Filter bar */}
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {selectedMembers.length > 0 ? (
              <>
                <Button asChild variant="destructive" onClick={openRemoveDialog} className="relative">
                  <motion.button layout="size" layoutRoot transition={{ duration: 0.1 }} layoutId="members-filter-bar-button">
                    <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5 animate-in zoom-in">
                      {selectedMembers.length}
                    </Badge>
                    <motion.span layoutId="members-filter-bar-icon">
                      <Trash size={16} />
                    </motion.span>

                    <span className="ml-1 max-xs:hidden">{entity.id ? t('common:remove') : t('common:delete')}</span>
                  </motion.button>
                </Button>

                <Button asChild variant="ghost" onClick={() => setSelectedRows(new Set<string>())}>
                  <motion.button
                    transition={{
                      bounce: 0,
                      duration: 0.2,
                    }}
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
                <Button asChild onClick={openInviteDialog}>
                  <motion.button transition={{ duration: 0.1 }} layoutId="members-filter-bar-button">
                    <motion.span layoutId="members-filter-bar-icon">
                      <Mail size={16} />
                    </motion.span>
                    <span className="ml-1">{t('common:invite')}</span>
                  </motion.button>
                </Button>
              )
            )}
            {!isLoading && selectedMembers.length === 0 && (
              <TableCount count={totalCount} type="member" isFiltered={isFiltered} onResetFilters={onResetFilters} />
            )}
          </FilterBarActions>
          <div className="sm:grow" />
          <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-left max-sm:fade-in max-sm:duration-300">
            <TableSearch value={q} setQuery={onSearch} />
            <SelectRole entityType={entityType} value={role === undefined ? 'all' : role} onChange={onRoleChange} className="h-10 sm:min-w-32" />
          </FilterBarContent>
        </TableFilterBar>

        {/* Columns view dropdown */}
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

        {/* Export */}
        {!isSheet && fetchForExport && (
          <Export<Member>
            className="max-lg:hidden"
            filename={`${entityType} members`}
            columns={columns}
            selectedRows={selectedMembers}
            fetchRows={fetchForExport}
          />
        )}
        {/* Focus view */}
        {!isSheet && <FocusView iconOnly />}
      </div>

      {/* Container ref to embed dialog */}
      <div ref={containerRef} />

      {/* Table */}
      <DataTable<Member>
        {...{
          columns: columns.filter((column) => column.visible),
          rowHeight: 42,
          enableVirtualization: false,
          onRowsChange,
          rows,
          limit,
          totalCount,
          rowKeyGetter: (row) => row.id,
          error,
          isLoading,
          isFetching,
          fetchMore: fetchNextPage,
          isFiltered,
          selectedRows,
          onSelectedRowsChange: setSelectedRows,
          sortColumns,
          onSortColumnsChange: setSortColumns,
        }}
      />
    </div>
  );
};

export default MembersTable;
