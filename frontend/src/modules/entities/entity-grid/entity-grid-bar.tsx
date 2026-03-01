import type { QueryKey } from '@tanstack/react-query';
import { ArrowDownAZIcon, CalendarIcon } from 'lucide-react';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { TableCount } from '~/modules/common/data-table/table-count';
import {
  FilterBarActions,
  FilterBarFilters,
  FilterBarSearch,
  TableFilterBar,
} from '~/modules/common/data-table/table-filter-bar';
import { TableSearch } from '~/modules/common/data-table/table-search';
import { FocusView } from '~/modules/common/focus-view';
import { SelectRole } from '~/modules/common/form-fields/select-role';
import { SelectSort } from '~/modules/common/form-fields/select-sort';
import { useInfiniteQueryTotal } from '~/query/basic';

export type EntityGridBarSearch = {
  q?: string;
  sort?: 'name' | 'createdAt';
  role?: string;
};

const entityGridSortOptions = [
  { name: 'common:alphabetical', icon: ArrowDownAZIcon, value: 'name' },
  { name: 'common:created_at', icon: CalendarIcon, value: 'createdAt' },
] as const;

type Props = {
  queryKey: QueryKey;
  label: string;
  searchVars: EntityGridBarSearch;
  setSearch: (search: EntityGridBarSearch) => void;
  isSheet?: boolean;
  focusView?: boolean;
};

export const EntityGridBar = ({ queryKey, label, searchVars, setSearch, isSheet, focusView }: Props) => {
  const { q, sort, role } = searchVars;

  const total = useInfiniteQueryTotal(queryKey);

  const isFiltered = !!q;

  const onSearch = (searchString: string) => setSearch({ q: searchString });
  const onSortChange = (sort: (typeof entityGridSortOptions)[number]['value']) => setSearch({ sort });
  const onRoleChange = (role?: string) =>
    setSearch({ role: role === 'all' ? undefined : (role as EntityGridBarSearch['role']) });

  const onResetFilters = () => setSearch({ q: '' });

  return (
    <TableBarContainer searchVars={searchVars} offsetTop={isSheet ? 0 : 36}>
      {/* Filter Bar */}
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          <TableCount count={total} label={label} isFiltered={isFiltered} onResetFilters={onResetFilters} />
        </FilterBarActions>
        <div className="sm:grow" />
        <FilterBarSearch>
          <TableSearch name="entitySearch" value={q} setQuery={onSearch} />
        </FilterBarSearch>
        <FilterBarFilters>
          <SelectSort
            value={sort ?? 'name'}
            onChange={onSortChange}
            className="h-10"
            sortOptions={entityGridSortOptions}
          />
          <SelectRole
            entity
            value={role === undefined ? 'all' : role}
            onChange={onRoleChange}
            className="h-10 sm:min-w-32"
          />
        </FilterBarFilters>
      </TableFilterBar>

      {/* Focus view */}
      {focusView && <FocusView iconOnly />}
    </TableBarContainer>
  );
};
