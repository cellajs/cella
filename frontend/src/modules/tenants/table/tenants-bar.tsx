import type { QueryKey } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';
import type { Tenant } from 'sdk';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { TenantsRouteSearchParams } from '~/modules/tenants/search-params-schemas';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

interface TenantsTableBarProps {
  queryKey: QueryKey;
  columns: ColumnOrColumnGroup<Tenant>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<Tenant>[]>>;
  searchVars: TenantsRouteSearchParams & { limit: number };
  setSearch: (newValues: Partial<TenantsRouteSearchParams>, saveSearch?: boolean) => void;
}

export function TenantsTableBar({ queryKey, searchVars, setSearch, columns, setColumns }: TenantsTableBarProps) {
  const total = useListQueryTotal(queryKey);
  const barFilters = useTableBarFilters({ searchVars, setSearch, reset: { q: '' } });

  return <TableBarShell {...barFilters} {...{ searchVars, total, columns, setColumns }} label="c:tenant" searchName="tenant-search" />;
}
