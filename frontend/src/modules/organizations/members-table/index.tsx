import { useInfiniteQuery } from '@tanstack/react-query';
import { useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { toast } from 'sonner';
import { useDebounce } from '~/hooks/use-debounce';
import { useMutateInfiniteQueryData } from '~/hooks/use-mutate-query-data';
import { DataTable } from '~/modules/common/data-table';
import type { ContextEntityType, Member } from '~/types';
import useSaveInSearchParams from '../../../hooks/use-save-in-search-params';
import { useColumns } from './columns';
import Toolbar from './toolbar';
import { useMutation } from '~/hooks/use-mutations';
import { updateMembership } from '~/api/memberships';
import { membersQueryOptions, OrganizationMembersRoute, type MembersSearchType } from '~/routes/organizations';
import type { config } from 'config';
import { getMembers } from '~/api/general';

const LIMIT = 40;

export type MembersRoles = (typeof config.rolesByType.entityRoles)[number] | undefined;

const MembersTable = ({ entityType, isAdmin }: { entityType: ContextEntityType; isAdmin: boolean }) => {
  const search = useSearch({ from: OrganizationMembersRoute.id });
  const { idOrSlug } = useParams({ from: OrganizationMembersRoute.id });

  const [rows, setRows] = useState<Member[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [query, setQuery] = useState<MembersSearchType['q']>(search.q);
  const [role, setRole] = useState<MembersSearchType['role']>(search.role);

  const [sortColumns, setSortColumns] = useState<SortColumn[]>(
    search.sort && search.order
      ? [{ columnKey: search.sort, direction: search.order === 'asc' ? 'ASC' : 'DESC' }]
      : [{ columnKey: 'createdAt', direction: 'DESC' }],
  );

  const debounceQuery = useDebounce(query, 300);

  const onRoleChange = (role?: string) => {
    setRole(role === 'all' ? undefined : (role as MembersRoles));
  };
  // Save filters in search params
  const filters = useMemo(
    () => ({
      q: debounceQuery,
      sort: sortColumns[0]?.columnKey,
      order: sortColumns[0]?.direction.toLowerCase(),
      role,
    }),
    [debounceQuery, role, sortColumns],
  );

  const { mutate: updateMemberRole } = useMutation({
    mutationFn: async (user: Member) => {
      return await updateMembership({ membershipId: user.membership.id, role: user.membership.role }); // Update member role
    },
    onSuccess: (response) => {
      callback([response], 'update');
      toast.success('Role updated successfully');
    },
    onError: () => toast.error('Error updating role'),
  });

  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  // redo 4 all members
  const callback = useMutateInfiniteQueryData([
    'members',
    idOrSlug,
    entityType,
    debounceQuery,
    sortColumns[0]?.columnKey as MembersSearchType['sort'],
    sortColumns[0]?.direction.toLowerCase() as MembersSearchType['order'],

    role,
  ]);

  // redo 4 all members
  const queryResult = useInfiniteQuery(
    membersQueryOptions({
      idOrSlug,
      entityType,
      q: debounceQuery,
      sort: sortColumns[0]?.columnKey as MembersSearchType['sort'],
      order: sortColumns[0]?.direction.toLowerCase() as MembersSearchType['order'],
      role,
      limit: LIMIT,
    }),
  );
  const [columns, setColumns] = useColumns(isAdmin);

  const isFiltered = role !== undefined || !!debounceQuery;

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
    setRole(undefined);
  };

  const onRowsChange = (changedRows: Member[], { indexes, column }: RowsChangeData<Member>) => {
    // mutate user role
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
        total={queryResult.data?.pages[0].total}
        query={query}
        setQuery={setQuery}
        onResetFilters={onResetFilters}
        onResetSelectedRows={() => setSelectedRows(new Set<string>())}
        role={role}
        isAdmin={isAdmin}
        selectedMembers={rows.filter((row) => selectedRows.has(row.id)) as Member[]}
        onRoleChange={onRoleChange}
        columns={columns}
        setColumns={setColumns}
        idOrSlug={idOrSlug}
        fetchForExport={async (limit: number) => {
          const data = await getMembers({
            q: debounceQuery,
            sort: sortColumns[0]?.columnKey as MembersSearchType['sort'],
            order: sortColumns[0]?.direction.toLowerCase() as MembersSearchType['order'],
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
          limit: LIMIT,
          totalCount: queryResult.data?.pages[0].total,
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
