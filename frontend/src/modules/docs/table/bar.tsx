import type { OperationSummary } from '~/api.gen/docs';
import ColumnsView from '~/modules/common/data-table/columns-view';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';

interface OperationsTableBarProps {
  total: number;
  q: string;
  setSearch: (params: { q?: string }) => void;
  columns: ColumnOrColumnGroup<OperationSummary>[];
  setColumns: React.Dispatch<React.SetStateAction<ColumnOrColumnGroup<OperationSummary>[]>>;
}

export const OperationsTableBar = ({ total, q, setSearch, columns, setColumns }: OperationsTableBarProps) => {
  const onSearch = (searchString: string) => {
    setSearch({ q: searchString });
  };

  const onResetFilters = () => {
    setSearch({ q: '' });
  };

  const isFiltered = !!q;

  return (
    <TableBarContainer>
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          <TableCount count={total} label="common:operation" isFiltered={isFiltered} onResetFilters={onResetFilters} />
        </FilterBarActions>

        <div className="sm:grow" />

        <FilterBarContent>
          <TableSearch name="operationsSearch" value={q} setQuery={onSearch} />
        </FilterBarContent>
      </TableFilterBar>

      <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
    </TableBarContainer>
  );
};
