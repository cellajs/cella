import type { Tenant } from 'sdk';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import type { TenantsRouteSearchParams } from '~/modules/tenants/types';
import { useTenantKindFilter } from '~/modules/tenants/use-tenant-kind-filter';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

type TenantsTableBarProps = Omit<BaseTableBarProps<Tenant, TenantsRouteSearchParams>, 'selected' | 'clearSelection'>;

export function TenantsTableBar({ queryKey, searchVars, setSearch, columns, setColumns }: TenantsTableBarProps) {
  const total = useListQueryTotal(queryKey);
  const barFilters = useTableBarFilters({ searchVars, setSearch, reset: { q: '', kind: [] } });
  const searchFilters = useTenantKindFilter({ value: searchVars.kind, onChange: (kind) => setSearch({ kind }) });

  return (
    <TableBarShell
      {...barFilters}
      {...{ searchVars, total, columns, setColumns }}
      label="c:tenant"
      searchName="tenantSearch"
      searchFilters={searchFilters}
    />
  );
}
