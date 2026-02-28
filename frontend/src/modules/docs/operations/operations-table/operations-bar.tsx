import type { Dispatch, SetStateAction } from 'react';
import { ColumnsView } from '~/modules/common/data-table/columns-view';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { TableCount } from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarSearch, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import { TableSearch } from '~/modules/common/data-table/table-search';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { FocusView } from '~/modules/common/focus-view';
import { ViewModeToggle } from '~/modules/docs/operations/view-mode-toggle';
import type { GenOperationSummary } from '~/modules/docs/types';

interface OperationsTableBarProps {
  total: number;
  searchVars: { q?: string };
  setSearch: (params: { q?: string }) => void;
  columns: ColumnOrColumnGroup<GenOperationSummary>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<GenOperationSummary>[]>>;
  isCompact: boolean;
  setIsCompact: (isCompact: boolean) => void;
  isEntityOnly: boolean;
  setIsEntityOnly: (isEntityOnly: boolean) => void;
}

export const OperationsTableBar = ({
  total,
  searchVars,
  setSearch,
  columns,
  setColumns,
  isCompact,
  setIsCompact,
  isEntityOnly,
  setIsEntityOnly,
}: OperationsTableBarProps) => {
  const onSearch = (searchString: string) => {
    setSearch({ q: searchString });
  };

  const onResetFilters = () => {
    setSearch({ q: '' });
  };

  const isFiltered = !!searchVars.q;

  return (
    <TableBarContainer searchVars={searchVars}>
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          <ViewModeToggle />
          <TableCount count={total} label="common:operation" isFiltered={isFiltered} onResetFilters={onResetFilters} />
        </FilterBarActions>

        <div className="sm:grow" />

        <FilterBarSearch>
          <TableSearch name="operationsSearch" value={searchVars.q} setQuery={onSearch} />
        </FilterBarSearch>
      </TableFilterBar>

      <ColumnsView
        className="max-lg:hidden"
        columns={columns}
        setColumns={setColumns}
        isCompact={isCompact}
        setIsCompact={setIsCompact}
        isEntityOnly={isEntityOnly}
        setIsEntityOnly={setIsEntityOnly}
      />
      <FocusView iconOnly />
    </TableBarContainer>
  );
};
