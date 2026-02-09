import { onlineManager, useInfiniteQuery } from '@tanstack/react-query';
import { BirdIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { membershipInvite } from '~/api.gen';
import { useSearchParams } from '~/hooks/use-search-params';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import type { RowsChangeData } from '~/modules/common/data-grid';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { toaster } from '~/modules/common/toaster/service';
import { meKeys } from '~/modules/me/query';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import { organizationQueryKeys, organizationsListQueryOptions } from '~/modules/organization/query';
import { OrganizationsTableBar } from '~/modules/organization/table/organizations-bar';
import { useColumns } from '~/modules/organization/table/organizations-columns';
import type { OrganizationsRouteSearchParams, OrganizationWithMembership } from '~/modules/organization/types';
import { useMutateQueryData } from '~/query/basic';
import { queryClient } from '~/query/query-client';
import { useUserStore } from '~/store/user';

const LIMIT = appConfig.requestLimits.organizations;

/** Stable row key getter function - defined outside component to prevent re-renders */
function rowKeyGetter(row: OrganizationWithMembership) {
  return row.id;
}

function OrganizationsTable() {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const updateMember = useMemberUpdateMutation();

  const mutateOrganizationsCache = useMutateQueryData(organizationQueryKeys.list.base);
  const { search, setSearch } = useSearchParams<OrganizationsRouteSearchParams>({
    from: '/appLayout/system/organizations',
  });

  // Table state
  const { q, sort, order } = search;
  const limit = LIMIT;

  const [isCompact, setIsCompact] = useState(false);

  // Build columns
  const [selected, setSelected] = useState<OrganizationWithMembership[]>([]);
  const [columns, setColumns] = useColumns(isCompact);
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = organizationsListQueryOptions({ ...search, limit, include: 'counts' });

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

  const onRowsChange = async (
    changedRows: OrganizationWithMembership[],
    { column, indexes }: RowsChangeData<OrganizationWithMembership>,
  ) => {
    if (column.key !== 'role') return;
    if (!onlineManager.isOnline()) {
      toaster(t('common:action.offline.text'), 'warning');
      return;
    }

    // If role is changed, update the membership
    for (const index of indexes) {
      const organization = changedRows[index];
      const membership = organization.membership;

      if (!membership?.role) continue;

      const newRole = membership.role;
      const partOfOrganization = !!membership.id;
      const mutationVariables = { id: membership.id, entityId: organization.id, entityType: organization.entityType };
      const tenantId = organization.tenantId;
      const orgIdOrSlug = organization.id;

      try {
        // TODO review if we can move some of this logic to query.ts / mutation itself.
        if (partOfOrganization) {
          await updateMember.mutateAsync({ role: newRole, tenantId, orgIdOrSlug, ...mutationVariables });
          // Update organizations cache to reflect membership change
          const updatedOrganization = { ...organization, membership: { ...membership, role: newRole } };
          mutateOrganizationsCache.update([updatedOrganization]);
        } else {
          const result = await membershipInvite({
            query: mutationVariables,
            path: { tenantId, orgIdOrSlug },
            body: { emails: [user.email], role: newRole },
          });

          // Add returned membership to cache directly (result is the response body)
          const createdMemberships = result.data;
          if (createdMemberships?.length) {
            const newMembership = createdMemberships[0];

            // Update memberships cache with the new membership
            queryClient.setQueryData<{ items: Array<typeof newMembership> }>(meKeys.memberships, (oldData) => {
              if (!oldData) return { items: [newMembership] };
              return { ...oldData, items: [...oldData.items, newMembership] };
            });

            // Update organizations cache with the new membership
            const updatedOrganization = { ...organization, membership: newMembership };
            mutateOrganizationsCache.update([updatedOrganization]);
          }

          toaster(t('common:success.role_updated'), 'success');
        }
      } catch (err) {
        toaster(t('error:error'), 'error');
      }
    }
  };

  // isFetching already includes next page fetch scenario
  const fetchMore = async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  };

  const onSelectedRowsChange = (value: Set<string>) => {
    if (rows) setSelected(rows.filter((row) => value.has(row.id)));
  };

  const selectedRowIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  const visibleColumns = useMemo(() => columns.filter((column) => column.visible), [columns]);

  return (
    <div className="flex flex-col gap-4 h-full" data-is-compact={isCompact}>
      <OrganizationsTableBar
        queryKey={queryOptions.queryKey}
        selected={selected}
        columns={columns}
        searchVars={{ ...search, limit }}
        setSearch={setSearch}
        setColumns={setColumns}
        clearSelection={() => setSelected([])}
        isCompact={isCompact}
        setIsCompact={setIsCompact}
      />
      <DataTable<OrganizationWithMembership>
        {...{
          rows: rows as OrganizationWithMembership[] | undefined,
          rowHeight: 52,
          onRowsChange,
          rowKeyGetter,
          columns: visibleColumns,
          enableVirtualization: true,
          limit,
          error,
          isLoading,
          isFetching,
          isFiltered: !!q,
          hasNextPage,
          fetchMore,
          selectedRows: selectedRowIds,
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: (
            <ContentPlaceholder
              icon={BirdIcon}
              title="common:no_resource_yet"
              titleProps={{ resource: t('common:organizations').toLowerCase() }}
            />
          ),
        }}
      />
    </div>
  );
}

export default OrganizationsTable;
