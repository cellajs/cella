import { useInfiniteQuery } from '@tanstack/react-query';
import { UsersIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import useSearchParams from '~/hooks/use-search-params';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import type { RowsChangeData } from '~/modules/common/data-grid';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { ContextEntityData } from '~/modules/entities/types';
import { MembersTableBar } from '~/modules/memberships/members-table/members-bar';
import { useColumns } from '~/modules/memberships/members-table/members-columns';
import { membersListQueryOptions } from '~/modules/memberships/query';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import type { Member, MembersRouteSearchParams } from '~/modules/memberships/types';
import { OrganizationLayoutRoute } from '~/routes/organization-routes';

const LIMIT = appConfig.requestLimits.members;

/** Stable row key getter function - defined outside component to prevent re-renders */
function rowKeyGetter(row: Member) {
  return row.id;
}

export interface MembersTableWrapperProps {
  entity: ContextEntityData;
  isSheet?: boolean;
  children?: React.ReactNode;
}

function MembersTable({ entity, isSheet = false, children }: MembersTableWrapperProps) {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<MembersRouteSearchParams>({ saveDataInSearch: !isSheet });

  // Get organization from route context - MembersTable is always rendered within OrganizationLayoutRoute
  const { organization } = OrganizationLayoutRoute.useRouteContext();

  const updateMemberMembership = useMemberUpdateMutation();

  const entityId = entity.id;
  const entityType = entity.entityType;
  const orgId = organization.id;

  // TODO can should always be here? Use can.update if available for permission-based access control
  const canUpdate = entity.can?.update ?? false;

  // Table state
  const { q, role, sort, order } = search;
  const limit = LIMIT;

  // Build columns
  const [selected, setSelected] = useState<Member[]>([]);
  const [columns, setColumns] = useColumns(canUpdate, isSheet);
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = membersListQueryOptions({ entityId, entityType, orgId, ...search, limit });

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
    // TODO review Deduplicate by id to prevent React key warnings during filter transitions
    // select: ({ pages }) => {
    //   const allItems = pages.flatMap(({ items }) => items);
    //   const seen = new Set<string>();
    //   return allItems.filter((item) => {
    //     if (seen.has(item.id)) return false;
    //     seen.add(item.id);
    //     return true;
    //   });
    // },
  });

  // Update rows
  const onRowsChange = (changedRows: Member[], { indexes, column }: RowsChangeData<Member>) => {
    if (column.key !== 'role') return;

    // If role is changed, update membership
    for (const index of indexes) {
      const updatedMembership = {
        id: changedRows[index].membership.id,
        role: changedRows[index].membership.role,
        orgId,
        entityId,
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

  // Memoize callback to prevent unnecessary re-renders
  const onSelectedRowsChange = useCallback(
    (value: Set<string>) => {
      if (rows) setSelected(rows.filter((row) => value.has(row.id)));
    },
    [rows],
  );

  const selectedRowIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  const visibleColumns = useMemo(() => columns.filter((column) => column.visible), [columns]);

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
          rowKeyGetter,
          columns: visibleColumns,
          enableVirtualization: true,
          limit,
          error,
          isLoading,
          isFetching,
          isFiltered: role !== undefined || !!q,
          hasNextPage,
          fetchMore,
          selectedRows: selectedRowIds,
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: (
            <ContentPlaceholder
              icon={UsersIcon}
              title="common:no_resource_yet"
              titleProps={{ resource: t('common:members').toLowerCase() }}
            />
          ),
        }}
      />
    </div>
  );
}

export default MembersTable;
