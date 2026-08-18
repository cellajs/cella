import type { QueryKey } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';
import type { TenantWithOrganization } from 'sdk';
import { ColumnsView } from '~/modules/common/data-table/columns-view';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { TableCount } from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarSearch, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import { TableSearch } from '~/modules/common/data-table/table-search';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { FocusView } from '~/modules/common/focus-view';
import type { TenantsRouteSearchParams } from '~/modules/tenants/search-params-schemas';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

interface TenantsTableBarProps {
  queryKey: QueryKey;
  columns: ColumnOrColumnGroup<TenantWithOrganization>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<TenantWithOrganization>[]>>;
  searchVars: TenantsRouteSearchParams & { limit: number };
  setSearch: (newValues: Partial<TenantsRouteSearchParams>, saveSearch?: boolean) => void;
}

export function TenantsTableBar({ queryKey, searchVars, setSearch, columns, setColumns }: TenantsTableBarProps) {
  const total = useListQueryTotal(queryKey);

  const { q } = searchVars;
  const isFiltered = !!q;

  const onSearch = (searchString: string) => {
    setSearch({ q: searchString });
  };

  const onResetFilters = () => {
    setSearch({ q: '' });
  };

  return (
    <TableBarContainer searchVars={searchVars} offsetTop={48}>
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          <TableCount count={total} label="c:tenant" isFiltered={isFiltered} onResetFilters={onResetFilters} />
        </FilterBarActions>

        <div className="sm:grow" />

        <FilterBarSearch>
          <TableSearch name="tenant-search" value={q} setQuery={onSearch} />
        </FilterBarSearch>
      </TableFilterBar>

      <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
      <FocusView iconOnly />
    </TableBarContainer>
  );
}
