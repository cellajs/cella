import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { TKey } from '~/lib/i18n-locales';
import { ColumnsView } from '~/modules/common/data-table/columns-view';
import { Export } from '~/modules/common/data-table/export';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { TableCount } from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarFilters, FilterBarSearch, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import { TableSearch } from '~/modules/common/data-table/table-search';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { FocusView } from '~/modules/common/focus-view';
import { SelectionActionBar } from '~/modules/common/selection-action-bar';

interface TableBarFiltersOptions<T extends { q?: string }> {
  searchVars: T;
  setSearch: (values: Partial<T>) => void;
  clearSelection?: () => void;
  /** Search values a reset writes; a filter is active while its key holds another value. */
  reset: Partial<T>;
}

/** Search and reset handlers of a table bar; a new search clears the selection first, a reset clears it after. */
export function useTableBarFilters<T extends { q?: string }>(options: TableBarFiltersOptions<T>) {
  const { searchVars, setSearch, clearSelection, reset } = options;
  const isFiltered = Object.entries(reset).some(([key, value]) => {
    const current = searchVars[key as keyof T];
    return current !== undefined && current !== value;
  });

  const onSearch = (q: string) => {
    clearSelection?.();
    setSearch({ q } as Partial<T>);
  };

  const onResetFilters = () => {
    setSearch(reset);
    clearSelection?.();
  };

  return { isFiltered, onSearch, onResetFilters };
}

interface TableBarShellProps<TRow extends Record<string, unknown>> extends ReturnType<typeof useTableBarFilters> {
  searchVars: { q?: string };
  total: number | null;
  /** Count label, pluralized by the total. */
  label: TKey;
  /** Name of the search input. */
  searchName: string;
  allowOfflineSearch?: boolean;
  columns: ColumnOrColumnGroup<TRow>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<TRow>[]>>;
  /** Buttons before the count, hidden while filtered. */
  actions?: ReactNode;
  /** Rendered after the count. */
  countExtra?: ReactNode;
  /** Filter controls next to the search. */
  filters?: ReactNode;
  export?: { filename: string; fetchRows: (limit: number, offset: number) => Promise<TRow[]>; selectedRows?: TRow[] };
  /** Shows the focus view toggle. Defaults to true. */
  focusView?: boolean;
  selection?: { count: number; onClear: () => void; children: ReactNode };
  /** Rendered below the bar. */
  after?: ReactNode;
}

/** The bar above an entity table: actions and count, search and filters, columns, export and focus view. */
export function TableBarShell<TRow extends Record<string, unknown>>(props: TableBarShellProps<TRow>) {
  const { searchVars, isFiltered, onSearch, onResetFilters, columns, focusView = true, selection } = props;

  return (
    <>
      <TableBarContainer searchVars={searchVars}>
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {!isFiltered && props.actions}
            <TableCount count={props.total} label={props.label} isFiltered={isFiltered} onResetFilters={onResetFilters}>
              {props.countExtra}
            </TableCount>
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarSearch>
            <TableSearch name={props.searchName} value={searchVars.q} setQuery={onSearch} allowOfflineSearch={props.allowOfflineSearch} />
          </FilterBarSearch>
          {props.filters && <FilterBarFilters>{props.filters}</FilterBarFilters>}
        </TableFilterBar>

        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={props.setColumns} />
        {props.export && <Export className="max-lg:hidden" columns={columns} {...props.export} />}
        {focusView && <FocusView iconOnly />}
      </TableBarContainer>

      {selection && <SelectionActionBar {...selection} />}
      {props.after}
    </>
  );
}
