import { TableBarContainer } from '../common/data-table/table-bar-container';
import TableCount from '../common/data-table/table-count';
import { TableFilterBar, FilterBarActions, FilterBarContent } from '../common/data-table/table-filter-bar';
import TableSearch from '../common/data-table/table-search';
import { FocusView } from '../common/focus-view';
import SelectSort from '../common/form-fields/select-sort';

interface Props {
  total?: number;
  searchVars: EntitySearch;
  setSearch: (search: EntitySearch) => void;
}

export const EntityGridBar = ({ total, searchVars, setSearch }: Props) => {
  const { q, sort, order } = searchVars;

  const isFiltered = !!q;

  // Clear selected rows on search
  const onSearch = (searchString: string) => {
    setSearch({ q: searchString });
  };

  const onSortChange = (sort?: string) => {
    setSearch({ sort: sort as EntitySearch['sort'] });
  };

  const onResetFilters = () => {
    setSearch({ q: '', role: undefined });
  };
  return (
    <TableBarContainer>
      {/* Filter Bar */}
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          <TableCount count={total} type="organization" isFiltered={isFiltered} onResetFilters={onResetFilters} />
        </FilterBarActions>
        <div className="sm:grow" />
        <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-left max-sm:fade-in max-sm:duration-300">
          <TableSearch value={q} setQuery={onSearch} />
          <SelectSort value={sort === undefined ? 'name' : sort} onChange={onSortChange} className="h-10" />
        </FilterBarContent>
      </TableFilterBar>

      {/* Focus view */}
      {<FocusView iconOnly />}
    </TableBarContainer>
  );
};
