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
import type { IconComponent } from '~/modules/common/icons/types';
import { useInfiniteQueryTotal } from '~/query/basic/use-infinite-query-total';

type EntityGridBarSearch = {
  q?: string;
  sort?: string;
  role?: string;
};

/** Sort option for the entity grid bar. Forks pass their own set via the `sortOptions` prop. */
export type EntityGridSortOption = {
  name: string;
  icon: IconComponent;
  value: string;
};

const entityGridSortOptions: readonly EntityGridSortOption[] = [
  { name: 'c:alphabetical', icon: ArrowDownAZIcon, value: 'name' },
  { name: 'c:created_at', icon: CalendarIcon, value: 'createdAt' },
];

type Props = {
  queryKey: QueryKey;
  label: string;
  searchVars: EntityGridBarSearch;
  setSearch: (search: EntityGridBarSearch) => void;
  isSheet?: boolean;
  focusView?: boolean;
  /** Sort options shown in the bar; defaults to alphabetical + created date. */
  sortOptions?: readonly EntityGridSortOption[];
};

export const EntityGridBar = ({
  queryKey,
  label,
  searchVars,
  setSearch,
  isSheet,
  focusView,
  sortOptions = entityGridSortOptions,
}: Props) => {
  const { q, sort, role } = searchVars;

  const total = useInfiniteQueryTotal(queryKey);

  const isFiltered = !!q;

  // Hide the bar when there are 3 or fewer items and no filters are active
  if (!isFiltered && (total ?? 0) <= 3) return null;

  const onSearch = (searchString: string) => setSearch({ q: searchString });
  const onSortChange = (sort: string) => setSearch({ sort });
  const onRoleChange = (role?: string) =>
    setSearch({ role: role === 'all' ? undefined : (role as EntityGridBarSearch['role']) });

  const onResetFilters = () => setSearch({ q: '' });

  return (
    <TableBarContainer searchVars={searchVars} offsetTop={isSheet ? 0 : 48}>
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
            value={sort ?? sortOptions[0].value}
            onChange={onSortChange}
            className="h-10"
            sortOptions={sortOptions}
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
