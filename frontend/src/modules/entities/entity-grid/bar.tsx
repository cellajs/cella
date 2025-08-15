import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { FocusView } from '~/modules/common/focus-view';
import SelectRole from '~/modules/common/form-fields/select-role';
import SelectSort from '~/modules/common/form-fields/select-sort';
import type { EntitySearch } from '~/modules/entities/entity-grid/grid';

type Props = {
  label: string;
  searchVars: EntitySearch;
  setSearch: (search: EntitySearch) => void;
  totalCount?: number;
  focusView?: boolean;
};

export const EntityGridBar = ({ totalCount, label, searchVars, setSearch, focusView }: Props) => {
  const { q, sort, role } = searchVars;

  const isFiltered = !!q;

  const onSearch = (searchString: string) => setSearch({ q: searchString });
  const onSortChange = (sort?: string) => setSearch({ sort: sort as EntitySearch['sort'] });
  const onRoleChange = (role?: string) => setSearch({ role: role === 'all' ? undefined : (role as EntitySearch['role']) });

  const onResetFilters = () => setSearch({ q: '' });

  return (
    <TableBarContainer>
      {/* Filter Bar */}
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          <TableCount count={totalCount} label={label} isFiltered={isFiltered} onResetFilters={onResetFilters} />
        </FilterBarActions>
        <div className="sm:grow" />
        <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-left max-sm:fade-in max-sm:duration-300">
          <TableSearch name="entitySearch" value={q} setQuery={onSearch} />
          <SelectSort value={sort === undefined ? 'name' : sort} onChange={onSortChange} className="h-10" />
          <SelectRole entity value={role === undefined ? 'all' : role} onChange={onRoleChange} className="h-10 sm:min-w-32" />
        </FilterBarContent>
      </TableFilterBar>

      {/* Focus view */}
      {focusView && <FocusView iconOnly />}
    </TableBarContainer>
  );
};
