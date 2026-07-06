import type { Dispatch, SetStateAction } from 'react';
import { ColumnsView } from '~/modules/common/data-table/columns-view';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { TableCount } from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarSearch, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import { TableSearch } from '~/modules/common/data-table/table-search';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { FocusView } from '~/modules/common/focus-view';
import type { PageTreeRow } from '~/modules/page/table/page-tree-config';
import type { PagesRouteSearchParams } from '~/modules/page/types';

interface PagesTableBarProps {
  total: number;
  searchVars: PagesRouteSearchParams;
  setSearch: (search: PagesRouteSearchParams) => void;
  columns: ColumnOrColumnGroup<PageTreeRow>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<PageTreeRow>[]>>;
}

/** Toolbar for the read-only pages table: search, count and column visibility. */
export const PagesTableBar = ({ total, searchVars, setSearch, columns, setColumns }: PagesTableBarProps) => {
  const { q } = searchVars;

  const isFiltered = !!q;

  const onSearch = (searchString: string) => {
    setSearch({ q: searchString });
  };

  const onResetFilters = () => {
    setSearch({ q: '' });
  };

  return (
    <TableBarContainer searchVars={searchVars}>
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          <TableCount count={total} label="c:page" isFiltered={isFiltered} onResetFilters={onResetFilters} />
        </FilterBarActions>

        <div className="sm:grow" />

        <FilterBarSearch>
          <TableSearch name="pageSearch" value={q} setQuery={onSearch} />
        </FilterBarSearch>
      </TableFilterBar>

      <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
      <FocusView iconOnly />
    </TableBarContainer>
  );
};
