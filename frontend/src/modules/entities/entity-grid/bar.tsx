import type { QueryKey } from '@tanstack/react-query';
import { ArrowDownAZ, Calendar } from 'lucide-react';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { FocusView } from '~/modules/common/focus-view';
import SelectRole from '~/modules/common/form-fields/select-role';
import SelectSort from '~/modules/common/form-fields/select-sort';
import type { EntitySearch } from '~/modules/entities/entity-grid/grid';
import { useInfiniteQueryTotal } from '~/query/hooks/use-infinite-query-total';

const entityGridSortOptions = [
  { name: 'common:alphabetical', icon: ArrowDownAZ, value: 'name' },
  { name: 'common:created_at', icon: Calendar, value: 'createdAt' },
] as const;

type Props = {
  queryKey: QueryKey;
  label: string;
  searchVars: EntitySearch;
  setSearch: (search: EntitySearch) => void;
  focusView?: boolean;
};

export const EntityGridBar = ({ queryKey, label, searchVars, setSearch, focusView }: Props) => {
  const { q, sort, role } = searchVars;

  const total = useInfiniteQueryTotal(queryKey);

  const isFiltered = !!q;

  const onSearch = (searchString: string) => setSearch({ q: searchString });
  const onSortChange = (sort: (typeof entityGridSortOptions)[number]['value']) => setSearch({ sort });
  const onRoleChange = (role?: string) => setSearch({ role: role === 'all' ? undefined : (role as EntitySearch['role']) });

  const onResetFilters = () => setSearch({ q: '' });

  return (
    <TableBarContainer>
      {/* Filter Bar */}
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          <TableCount count={total} label={label} isFiltered={isFiltered} onResetFilters={onResetFilters} />
        </FilterBarActions>
        <div className="sm:grow" />
        <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-left max-sm:fade-in max-sm:duration-300">
          <TableSearch name="entitySearch" value={q} setQuery={onSearch} />
          <SelectSort value={sort ?? 'name'} onChange={onSortChange} className="h-10" sortOptions={entityGridSortOptions} />
          <SelectRole entity value={role === undefined ? 'all' : role} onChange={onRoleChange} className="h-10 sm:min-w-32" />
        </FilterBarContent>
      </TableFilterBar>

      {/* Focus view */}
      {focusView && <FocusView iconOnly />}
    </TableBarContainer>
  );
};
