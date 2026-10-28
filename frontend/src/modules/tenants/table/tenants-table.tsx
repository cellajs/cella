import { BuildingIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Tenant } from 'sdk';
import { useSearchParams } from '~/hooks/use-search-params';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import type { RowsChangeData } from '~/modules/common/data-grid';
import { DataTable, rowKeyById } from '~/modules/common/data-table/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { useInfiniteRows } from '~/modules/common/data-table/use-infinite-rows';
import { tenantsListQueryOptions, useTenantUpdateMutation } from '~/modules/tenants/query';
import { TenantsTableBar } from '~/modules/tenants/table/tenants-bar';
import { useColumns } from '~/modules/tenants/table/tenants-columns';
import type { TenantsRouteSearchParams } from '~/modules/tenants/types';

export function TenantsTable() {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<TenantsRouteSearchParams>({ from: '/_app/system/tenants' });

  const { q, sort, order } = search;

  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);
  const updateTenant = useTenantUpdateMutation();

  const queryOptions = tenantsListQueryOptions(search);
  const list = useInfiniteRows(queryOptions);

  const onRowsChange = (changedRows: Tenant[], { indexes, column }: RowsChangeData<Tenant>) => {
    if (column.key !== 'status') return;
    for (const index of indexes) {
      const tenant = changedRows[index];
      updateTenant.mutate({ path: { tenantId: tenant.id }, body: { status: tenant.status } });
    }
  };

  return (
    <>
      <TenantsTableBar queryKey={queryOptions.queryKey} columns={columns} setColumns={setColumns} searchVars={search} setSearch={setSearch} />
      <DataTable<Tenant>
        {...{
          ...list,
          rowKeyGetter: rowKeyById,
          onRowsChange,
          columns,
          enableVirtualization: true,
          isFiltered: !!q,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: <ContentPlaceholder icon={BuildingIcon} title="c:no_resource_yet" titleOptions={{ resource: t('c:tenant_other') }} />,
        }}
      />
    </>
  );
}
