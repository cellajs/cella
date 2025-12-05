import { onlineManager, useInfiniteQuery } from '@tanstack/react-query';
import { appConfig } from 'config';
import { BirdIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { membershipInvite, type Organization } from '~/api.gen';
import useSearchParams from '~/hooks/use-search-params';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { toaster } from '~/modules/common/toaster/service';
import { getAndSetMenu } from '~/modules/me/helpers';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import { organizationsKeys, organizationsQueryOptions } from '~/modules/organizations/query';
import { OrganizationsTableBar } from '~/modules/organizations/table/bar';
import { useColumns } from '~/modules/organizations/table/columns';
import type { OrganizationsRouteSearchParams } from '~/modules/organizations/types';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';
import { useUserStore } from '~/store/user';

const LIMIT = appConfig.requestLimits.organizations;

const OrganizationsTable = () => {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const updateMember = useMemberUpdateMutation();

  const mutateOrganizationsCache = useMutateQueryData(organizationsKeys.table.base);
  const { search, setSearch } = useSearchParams<OrganizationsRouteSearchParams>({ from: '/appLayout/system/organizations' });

  // Table state
  const { q, sort, order } = search;
  const limit = LIMIT;

  const [isCompact, setIsCompact] = useState(false);

  // Build columns
  const [selected, setSelected] = useState<Organization[]>([]);
  const [columns, setColumns] = useColumns(isCompact);
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = organizationsQueryOptions({ ...search, limit });

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

  const onRowsChange = async (changedRows: Organization[], { column, indexes }: RowsChangeData<Organization>) => {
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
      const mutationVariables = { idOrSlug: organization.slug, entityType: organization.entityType };
      const orgIdOrSlug = organization.id;

      try {
        // TODO re-check and add mutation or invalidation all connected queries(members table, single organization query)
        if (partOfOrganization) {
          await updateMember.mutateAsync({ id: membership.id, role: newRole, orgIdOrSlug, ...mutationVariables });
          // Update organizations cache to reflect membership change
          const updatedOrganization = { ...organization, membership: { ...membership, role: newRole } };
          mutateOrganizationsCache.update([updatedOrganization]);
        } else {
          await membershipInvite({ query: mutationVariables, path: { orgIdOrSlug }, body: { emails: [user.email], role: newRole } });

          const menu = await getAndSetMenu();
          const targetMenuItem = menu.organization.find((org) => org.id === organization.id);
          if (targetMenuItem) {
            const updatedOrganization = { ...organization, membership: targetMenuItem.membership };
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
  const fetchMore = useCallback(async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  }, [hasNextPage, isLoading, isFetching]);

  const onSelectedRowsChange = (value: Set<string>) => {
    if (rows) setSelected(rows.filter((row) => value.has(row.id)));
  };

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
      <DataTable<Organization>
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
          isFiltered: !!q,
          hasNextPage,
          fetchMore,
          selectedRows: new Set(selected.map((s) => s.id)),
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: (
            <ContentPlaceholder icon={BirdIcon} title="common:no_resource_yet" titleProps={{ resource: t('common:organizations').toLowerCase() }} />
          ),
        }}
      />
    </div>
  );
};

export default OrganizationsTable;
