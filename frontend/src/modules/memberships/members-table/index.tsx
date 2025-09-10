import { useInfiniteQuery } from '@tanstack/react-query';
import { appConfig } from 'config';
import { Users } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import useSearchParams from '~/hooks/use-search-params';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { EntityPage } from '~/modules/entities/types';
import { MembersTableBar } from '~/modules/memberships/members-table/bar';
import { useColumns } from '~/modules/memberships/members-table/columns';
import { membersQueryOptions } from '~/modules/memberships/query';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import type { Member, MembersRouteSearchParams } from '~/modules/memberships/types';

const LIMIT = appConfig.requestLimits.members;

export interface MembersTableWrapperProps {
  entity: EntityPage;
  isSheet?: boolean;
  children?: React.ReactNode;
}

const MembersTable = ({ entity, isSheet = false, children }: MembersTableWrapperProps) => {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<MembersRouteSearchParams>({ saveDataInSearch: !isSheet });

  const updateMemberMembership = useMemberUpdateMutation();

  const entityType = entity.entityType;
  const organizationId = entity.organizationId || entity.id;
  const isAdmin = entity.membership?.role === 'admin';

  // Table state
  const { q, role, sort, order } = search;
  const limit = LIMIT;

  // Build columns
  const [selected, setSelected] = useState<Member[]>([]);
  const [columns, setColumns] = useColumns(isAdmin, isSheet);
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = membersQueryOptions({
    idOrSlug: entity.slug,
    entityType,
    orgIdOrSlug: organizationId,
    ...search,
    limit,
  });

  const {
    data: rows,
    isLoading,
    isFetching,
    error,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    ...queryOptions,
    select: ({ pages }) => pages.flatMap(({ items }) => items),
  });

  // Update rows
  const onRowsChange = (changedRows: Member[], { indexes, column }: RowsChangeData<Member>) => {
    if (column.key !== 'role') return;

    const idOrSlug = entity.slug;
    const entityType = entity.entityType;
    const organizationId = entity.organizationId || entity.id;

    // If role is changed, update membership
    for (const index of indexes) {
      const updatedMembership = {
        id: changedRows[index].membership.id,
        role: changedRows[index].membership.role,
        orgIdOrSlug: organizationId,
        // Mutation variables
        idOrSlug,
        entityType,
      };

      updateMemberMembership.mutateAsync(updatedMembership);
    }
  };

  // isFetching already includes next page fetch scenario
  const fetchMore = useCallback(async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  }, [hasNextPage, isLoading, isFetching]);

  const onSelectedRowsChange = (value: Set<string>) => {
    if (rows) setSelected(rows.filter((row) => value.has(row.id)));
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <MembersTableBar
        entity={entity}
        selected={selected}
        searchVars={{ ...search, limit }}
        setSearch={setSearch}
        queryKey={queryOptions.queryKey}
        columns={columns}
        setColumns={setColumns}
        clearSelection={() => setSelected([])}
        isSheet={isSheet}
      />
      {children}
      <DataTable<Member>
        {...{
          rows,
          rowHeight: 52,
          onRowsChange,
          rowKeyGetter: (row) => row.id,
          columns: columns.filter((column) => column.visible),
          enableVirtualization: false,
          limit,
          error,
          isLoading,
          isFetching,
          isFiltered: role !== undefined || !!q,
          hasNextPage,
          fetchMore,
          selectedRows: new Set(selected.map((s) => s.id)),
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: <ContentPlaceholder icon={Users} title={t('common:no_resource_yet', { resource: t('common:members').toLowerCase() })} />,
        }}
      />
    </div>
  );
};

export default MembersTable;
