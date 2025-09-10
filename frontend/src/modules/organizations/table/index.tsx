import { onlineManager, useInfiniteQuery } from '@tanstack/react-query';
import { appConfig } from 'config';
import { Bird } from 'lucide-react';
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
import { organizationsQueryOptions } from '~/modules/organizations/query';
import { OrganizationsTableBar } from '~/modules/organizations/table/bar';
import { useColumns } from '~/modules/organizations/table/columns';
import { useUserStore } from '~/store/user';
import type { OrganizationsRouteSearchParams } from '../types';

const LIMIT = appConfig.requestLimits.organizations;

const OrganizationsTable = () => {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const updateMemberMembership = useMemberUpdateMutation();
  const { search, setSearch } = useSearchParams<OrganizationsRouteSearchParams>({ from: '/appLayout/system/organizations' });

  // Table state
  const { q, sort, order } = search;
  const limit = LIMIT;

  // Build columns
  const [selected, setSelected] = useState<Organization[]>([]);
  const [columns, setColumns] = useColumns();
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

    for (const index of indexes) {
      const organization = changedRows[index];
      const membership = organization.membership;

      if (!membership?.role) continue;

      const newRole = membership.role;
      const partOfOrganization = !!membership.id;
      const mutationVariables = {
        idOrSlug: organization.slug,
        entityType: organization.entityType,
      };
      const orgIdOrSlug = organization.id;

      try {
        if (partOfOrganization) {
          await updateMemberMembership.mutateAsync({ id: membership.id, role: newRole, orgIdOrSlug, ...mutationVariables });
        } else {
          await membershipInvite({ query: mutationVariables, path: { orgIdOrSlug }, body: { emails: [user.email], role: newRole } });
          await getAndSetMenu();
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
    <div className="flex flex-col gap-4 h-full">
      <OrganizationsTableBar
        queryKey={queryOptions.queryKey}
        selected={selected}
        columns={columns}
        searchVars={{ ...search, limit }}
        setSearch={setSearch}
        setColumns={setColumns}
        clearSelection={() => setSelected([])}
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
            <ContentPlaceholder icon={Bird} title={t('common:no_resource_yet', { resource: t('common:organizations').toLowerCase() })} />
          ),
        }}
      />
    </div>
  );
};

export default OrganizationsTable;
