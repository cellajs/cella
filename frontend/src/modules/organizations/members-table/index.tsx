import { onlineManager, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { membersQuerySchema } from 'backend/modules/general/schema';
import { motion } from 'framer-motion';
import { Mail, Trash, XSquare } from 'lucide-react';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { getMembers } from '~/api/general';
import { updateMembership } from '~/api/memberships';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useDebounce } from '~/hooks/use-debounce';
import useMapQueryDataToRows from '~/hooks/use-map-query-data-to-rows';
import { useMutateInfiniteQueryData } from '~/hooks/use-mutate-query-data';
import { useMutation } from '~/hooks/use-mutations';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { showToast } from '~/lib/taosts-show';
import { DataTable } from '~/modules/common/data-table';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
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
import { useColumns } from '~/modules/organizations/members-table/columns';
import { membersQueryOptions } from '~/modules/organizations/members-table/helpers/query-options';
import RemoveMembersForm from '~/modules/organizations/members-table/remove-member-form';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import InviteUsers from '~/modules/users/invite-users';
import type { EntityPage, Member, MinimumMembershipInfo } from '~/types/common';

const LIMIT = 40;

type MemberSearch = z.infer<typeof membersQuerySchema>;

interface MembersTableProps {
  entity: EntityPage & { membership: MinimumMembershipInfo | null };
  isSheet?: boolean;
}

const MembersTable = ({ entity, isSheet = false }: MembersTableProps) => {
  const { t } = useTranslation();
  const search = useSearch({ strict: false });
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const entityType = entity.entity;
  const isAdmin = entity.membership?.role === 'admin';

  const isMobile = useBreakpoints('max', 'sm');

  const [rows, setRows] = useState<Member[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [query, setQuery] = useState<MemberSearch['q']>(search.q);
  const [role, setRole] = useState<MemberSearch['role']>(search.role as MemberSearch['role']);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // Search query options
  const q = useDebounce(query, 200);
  const sort = sortColumns[0]?.columnKey as MemberSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as MemberSearch['order'];
  const limit = LIMIT;

  // Check if table has enabled filtered
  const isFiltered = role !== undefined || !!q;

  // Query members
  const queryResult = useSuspenseInfiniteQuery(
    membersQueryOptions({
      idOrSlug: entity.slug,
      entityType,
      q,
      sort,
      order,
      role,
      limit,
      rowsLength: rows.length,
    }),
  );

  // Total count
  const totalCount = queryResult.data?.pages[0].total;

  const openUserPreview = (user: Member) => {
    openUserPreviewSheet(user);
    navigate({
      to: '.',
      replace: true,
      resetScroll: false,
      search: (prev) => ({
        ...prev,
        ...{ userIdPreview: user.id },
      }),
    });
  };

  // Build columns
  const [columns, setColumns] = useState<ColumnOrColumnGroup<Member>[]>([]);
  useMemo(() => setColumns(useColumns(t, openUserPreview, isMobile, isAdmin, isSheet)), [isAdmin]);
  // Map (updated) query data to rows
  useMapQueryDataToRows<Member>({ queryResult, setSelectedRows, setRows, selectedRows });

  // Save filters in search params
  if (!isSheet) {
    const filters = useMemo(
      () => ({
        q,
        sort,
        order,
        role,
      }),
      [q, role, sortColumns],
    );
    useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });
  }
  // Table selection
  const selectedMembers = useMemo(() => {
    return rows.filter((row) => selectedRows.has(row.id));
  }, [selectedRows, rows]);

  const callback = useMutateInfiniteQueryData(['members', entity.slug, entityType, q, sort, order, role], (item) => ['members', item.id]);
  // Update member role
  const { mutate: updateMemberRole } = useMutation({
    mutationFn: async (user: Member) => await updateMembership({ membershipId: user.membership.id, role: user.membership.role }),
    onSuccess: (updatedMembership) => {
      showToast(t('common:success:user_role_updated'), 'success');
      callback([updatedMembership], 'updateMembership');
    },
    onError: () => showToast('Error updating role', 'error'),
  });

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
    setRole(undefined);
  };

  // Drop selected Rows on search
  const onSearch = (searchString: string) => {
    if (selectedRows.size > 0) setSelectedRows(new Set<string>());
    setQuery(searchString);
  };

  const onRoleChange = (role?: string) => {
    setSelectedRows(new Set<string>());
    setRole(role === 'all' ? undefined : (role as MemberSearch['role']));
  };

  const onRowsChange = (changedRows: Member[], { indexes, column }: RowsChangeData<Member>) => {
    if (!onlineManager.isOnline()) return toast.warning(t('common:action.offline.text'));

    for (const index of indexes) {
      if (column.key === 'role') updateMemberRole(changedRows[index]);
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
      idOrSlug: entity.id,
      entityType,
    });
    return data.items;
  };

  const openInviteDialog = () => {
    dialog(<InviteUsers entity={entity} mode={null} dialog />, {
      id: `user-invite-${entity.id}`,
      drawerOnMobile: false,
      className: 'w-auto shadow-none relative z-[120] max-w-4xl',
      container: containerRef.current,
      title: t('common:invite'),
      text: `${t('common:invite_users.text')}`,
    });
  };

  const openRemoveDialog = () => {
    dialog(
      <RemoveMembersForm
        entityId={entity.id}
        entityType={entityType}
        dialog
        callback={(members) => {
          toast.success(t('common:success.delete_members'));
          callback(members, 'delete');
        }}
        members={selectedMembers}
      />,
      {
        className: 'max-w-xl',
        title: t('common:remove_resource', { resource: t('member').toLowerCase() }),
        text: (
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

  useEffect(() => {
    setSortColumns(getInitialSortColumns(search));
  }, [search, entity.id]);

  useEffect(() => {
    if (!rows.length || !('userIdPreview' in search) || !search.userIdPreview) return;
    const user = rows.find((t) => t.id === search.userIdPreview);
    if (user) openUserPreviewSheet(user);
  }, [rows]);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className={'flex items-center max-sm:justify-between md:gap-2'}>
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
            {selectedMembers.length === 0 && <TableCount count={totalCount} type="member" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
          </FilterBarActions>
          <div className="sm:grow" />
          <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-left max-sm:fade-in max-sm:duration-300">
            <TableSearch value={query} setQuery={onSearch} />
            <SelectRole entityType={entityType} value={role === undefined ? 'all' : role} onChange={onRoleChange} className="h-10 sm:min-w-32" />
          </FilterBarContent>
        </TableFilterBar>
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
        {!isSheet && fetchForExport && (
          <Export<Member>
            className="max-lg:hidden"
            filename={`${entityType} members`}
            columns={columns}
            selectedRows={selectedMembers}
            fetchRows={fetchForExport}
          />
        )}
        {!isSheet && <FocusView iconOnly />}
      </div>
      <div ref={containerRef} />
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
          error: queryResult.error,
          isLoading: queryResult.isLoading,
          isFetching: queryResult.isFetching,
          fetchMore: queryResult.fetchNextPage,
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
