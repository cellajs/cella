import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { FocusView } from '~/modules/common/focus-view';
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
  const { q, sort } = searchVars;

  const isFiltered = !!q;

  // Clear selected rows on search
  const onSearch = (searchString: string) => setSearch({ q: searchString });

  const onSortChange = (sort?: string) => setSearch({ sort: sort as EntitySearch['sort'] });

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
          <TableSearch value={q} setQuery={onSearch} />
          <SelectSort value={sort === undefined ? 'name' : sort} onChange={onSortChange} className="h-10" />
        </FilterBarContent>
      </TableFilterBar>

      {/* Focus view */}
      {focusView && <FocusView iconOnly />}
    </TableBarContainer>
  );
};
