import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import { useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

import type { getMembersQuerySchema } from 'backend/modules/general/schema';
import type { config } from 'config';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { type GetMembersParams, getMembers } from '~/api/general';
import { updateMembership } from '~/api/memberships';
import { useDebounce } from '~/hooks/use-debounce';
import { useMutateInfiniteQueryData } from '~/hooks/use-mutate-query-data';
import { useMutation } from '~/hooks/use-mutations';
import { DataTable } from '~/modules/common/data-table';
import { getInitialSortColumns } from '~/modules/common/data-table/init-sort-columns';
import { OrganizationMembersRoute } from '~/routes/organizations';
import type { ContextEntityType, Member } from '~/types';
import useSaveInSearchParams from '../../../hooks/use-save-in-search-params';
import { useColumns } from './columns';
import Toolbar from './toolbar';

const LIMIT = 40;

// TODO: isnt this type already available elsewhere?
export type MembersRoles = (typeof config.rolesByType.entityRoles)[number] | undefined;

export type UsersSearch = z.infer<typeof getMembersQuerySchema>;

interface MembersTableProps {
  entityType: ContextEntityType;
}

// Build query to get members with infinite scroll
export const membersQueryOptions = ({ idOrSlug, entityType, q, sort: initialSort, order: initialOrder, role, limit }: GetMembersParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['members', idOrSlug, entityType, q, sort, order, role],
    initialPageParam: 0,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => getMembers({ page, q, sort, order, role, limit, idOrSlug, entityType }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

const MembersTable = ({ entityType }: MembersTableProps) => {
  const { t } = useTranslation();
  const search = useSearch({ from: OrganizationMembersRoute.id });
  const { idOrSlug } = useParams({ from: OrganizationMembersRoute.id });

  const [rows, setRows] = useState<Member[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [query, setQuery] = useState<UsersSearch['q']>(search.q);
  const [role, setRole] = useState<UsersSearch['role']>(search.role);

  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // Search query options
  const q = useDebounce(query, 200);
  const sort = sortColumns[0]?.columnKey as UsersSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as UsersSearch['order'];
  const limit = LIMIT;

  // Check if table has enabled filtered
  const isFiltered = role !== undefined || !!q;

  // Query members
  const queryResult = useInfiniteQuery(membersQueryOptions({ idOrSlug, entityType, q, sort, order, role, limit }));

  // Total count
  const totalCount = queryResult.data?.pages[0].total;

  const onRoleChange = (role?: string) => {
    setRole(role === 'all' ? undefined : (role as MembersRoles));
  };
  // Save filters in search params
  const filters = useMemo(
    () => ({
      q,
      sort: sortColumns[0]?.columnKey,
      order: sortColumns[0]?.direction.toLowerCase(),
      role,
    }),
    [q, role, sortColumns],
  );
  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  // Update member role
  const { mutate: updateMemberRole } = useMutation({
    mutationFn: async (user: Member) => await updateMembership({ membershipId: user.membership.id, role: user.membership.role }),
    onSuccess: (updatedMembership) => {
      callback([updatedMembership], 'update');
      toast.success(t('common:success:user_role_updated'));
    },
    onError: () => toast.error('Error updating role'),
  });

  // redo 4 all members
  const callback = useMutateInfiniteQueryData([
    'members',
    idOrSlug,
    entityType,
    q,
    sortColumns[0]?.columnKey as UsersSearch['sort'],
    sortColumns[0]?.direction.toLowerCase() as UsersSearch['order'],
    role,
  ]);

  const [columns, setColumns] = useColumns();

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
    setRole(undefined);
  };

  const onRowsChange = (changedRows: Member[], { indexes, column }: RowsChangeData<Member>) => {
    for (const index of indexes) {
      if (column.key === 'role') updateMemberRole(changedRows[index]);
    }
    setRows(changedRows);
  };

  useEffect(() => {
    const data = queryResult.data?.pages?.flatMap((page) => page.items);

    if (data) {
      setSelectedRows(new Set<string>([...selectedRows].filter((id) => data.some((row) => row.id === id))));
      setRows(data);
    }
  }, [queryResult.data]);

  return (
    <div className="space-y-4 h-full">
      <Toolbar
        callback={callback}
        entityType={entityType}
        isFiltered={isFiltered}
        total={totalCount}
        query={query}
        setQuery={setQuery}
        onResetFilters={onResetFilters}
        onResetSelectedRows={() => setSelectedRows(new Set<string>())}
        role={role}
        selectedMembers={rows.filter((row) => selectedRows.has(row.id)) as Member[]}
        onRoleChange={onRoleChange}
        columns={columns}
        setColumns={setColumns}
        idOrSlug={idOrSlug}
        fetchForExport={async (limit: number) => {
          const data = await getMembers({
            q,
            sort: sortColumns[0]?.columnKey as UsersSearch['sort'],
            order: sortColumns[0]?.direction.toLowerCase() as UsersSearch['order'],
            role,
            limit,
            idOrSlug,
            entityType,
          });
          return data.items;
        }}
      />
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
