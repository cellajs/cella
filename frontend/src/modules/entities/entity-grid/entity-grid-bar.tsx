import type { QueryKey } from '@tanstack/react-query';
import { ArrowDownAZIcon, CalendarIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ChannelEntityType } from 'shared';
import type { TKey } from '~/lib/i18n-locales';
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
import { GRID_PREVIEW_LIMIT } from '~/modules/entities/entity-grid/grid';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

type EntityGridBarSearch = {
  q?: string;
  sort?: string;
  role?: string;
};

export type EntityGridSortOption = {
  name: TKey;
  icon: IconComponent;
  value: string;
};

const entityGridSortOptions: readonly EntityGridSortOption[] = [
  { name: 'c:alphabetical', icon: ArrowDownAZIcon, value: 'name' },
  { name: 'c:created_at', icon: CalendarIcon, value: 'createdAt' },
];

type Props = {
  queryKey: QueryKey;
  label: TKey;
  /** Channel entity the grid lists; scopes the role filter to that entity's role vocabulary. */
  entityType: ChannelEntityType;
  searchVars: EntityGridBarSearch;
  setSearch: (search: EntityGridBarSearch) => void;
  isSheet?: boolean;
  focusView?: boolean;
  /** Sort options shown in the bar; defaults to alphabetical + created date. */
  sortOptions?: readonly EntityGridSortOption[];
  /** Slot for surface actions (e.g. a create button), rendered before the count while unfiltered. */
  actions?: ReactNode;
  /** Always-rendered slot for a grid/table view toggle, placed after the filter bar. */
  viewToggle?: ReactNode;
  /**
   * Show the role filter (default true). Discovery-scoped grids pass false: a role filter
   * collapses the backend scope to membership-only rows.
   */
  roleFilter?: boolean;
  /** Render the bar even at or below GRID_PREVIEW_LIMIT while unfiltered (default false). */
  alwaysShow?: boolean;
};

export function EntityGridBar({
  queryKey,
  label,
  entityType,
  searchVars,
  setSearch,
  isSheet,
  focusView,
  sortOptions = entityGridSortOptions,
  actions,
  viewToggle,
  roleFilter = true,
  alwaysShow = false,
}: Props) {
  const { q, sort, role } = searchVars;

  const total = useListQueryTotal(queryKey);

  const isFiltered = !!q;

  // Hide the bar at or below the preview count while unfiltered; the actions slot stays rendered
  if (!alwaysShow && !isFiltered && (total ?? 0) <= GRID_PREVIEW_LIMIT) {
    return actions ? <div className="flex items-center">{actions}</div> : null;
  }

  const onSearch = (searchString: string) => setSearch({ q: searchString });
  const onSortChange = (sort: string) => setSearch({ sort });
  const onRoleChange = (role?: string) =>
    setSearch({ role: role === 'all' ? undefined : (role as EntityGridBarSearch['role']) });

  const onResetFilters = () => setSearch({ q: '' });

  return (
    <TableBarContainer searchVars={searchVars} offsetTop={isSheet ? 0 : 48}>
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          {!isFiltered && actions}
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
          {roleFilter && (
            <SelectRole
              entityType={entityType}
              value={role === undefined ? 'all' : role}
              onChange={onRoleChange}
              className="h-10 sm:min-w-32"
            />
          )}
        </FilterBarFilters>
      </TableFilterBar>

      {viewToggle}

      {focusView && <FocusView iconOnly />}
    </TableBarContainer>
  );
}
