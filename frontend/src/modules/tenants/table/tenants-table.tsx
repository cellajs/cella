import { useInfiniteQuery } from '@tanstack/react-query';
import { BuildingIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import type { Tenant } from '~/api.gen';
import { useSearchParams } from '~/hooks/use-search-params';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import type { RowsChangeData } from '~/modules/common/data-grid';
import { DataTable } from '~/modules/common/data-table/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { tenantsListQueryOptions, useTenantUpdateMutation } from '~/modules/tenants/query';
import type { TenantsRouteSearchParams } from '~/modules/tenants/search-params-schema';
import { TenantsTableBar } from '~/modules/tenants/table/tenants-bar';
import { useColumns } from '~/modules/tenants/table/tenants-columns';

const LIMIT = appConfig.requestLimits.users; // Use users limit as fallback

/** Stable row key getter function */
function rowKeyGetter(row: Tenant) {
  return row.id;
}

/**
 * Tenants table for system admin panel.
 * Allows viewing and managing all tenants in the system.
 */
function TenantsTable() {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<TenantsRouteSearchParams>({ from: '/appLayout/system/tenants' });

  // Table state
  const { q, sort, order } = search;
  const limit = LIMIT;

  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);
  const updateTenant = useTenantUpdateMutation();

  const queryOptions = tenantsListQueryOptions({ ...search, limit });
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

  // isFetching already includes next page fetch scenario
  const fetchMore = async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  };

  const onRowsChange = (changedRows: Tenant[], { indexes, column }: RowsChangeData<Tenant>) => {
    if (column.key !== 'status') return;
    for (const index of indexes) {
      const tenant = changedRows[index];
      updateTenant.mutate({ path: { tenantId: tenant.id }, body: { status: tenant.status } });
    }
  };

  const visibleColumns = useMemo(() => columns.filter((column) => !column.hidden), [columns]);

  return (
    <FocusViewContainer>
      <TenantsTableBar
        queryKey={queryOptions.queryKey}
        columns={columns}
        setColumns={setColumns}
        searchVars={{ ...search, limit }}
        setSearch={setSearch}
      />
      <DataTable<Tenant>
        {...{
          rows,
          rowHeight: 52,
          rowKeyGetter,
          onRowsChange,
          columns: visibleColumns,
          enableVirtualization: true,
          limit,
          error,
          isLoading,
          isFetching,
          isFiltered: !!q,
          hasNextPage,
          fetchMore,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: (
            <ContentPlaceholder
              icon={BuildingIcon}
              title="common:no_resource_yet"
              titleProps={{ resource: t('common:tenants').toLowerCase() }}
            />
          ),
        }}
      />
    </FocusViewContainer>
  );
}

export default TenantsTable;
