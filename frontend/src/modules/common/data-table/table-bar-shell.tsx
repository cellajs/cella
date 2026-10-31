import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { TableCount } from '~/modules/common/data-table/table-count';
import { TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import { TableSearch } from '~/modules/common/data-table/table-search';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { ViewMenu, type ViewMenuExport, type ViewMenuSort } from '~/modules/common/data-table/view-menu';
import { FocusView } from '~/modules/common/focus-view';
import { SearchChipsField, type SearchFilters } from '~/modules/common/search-chips-field';
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

interface TableBarShellProps<TRow extends object> extends ReturnType<typeof useTableBarFilters> {
  searchVars: { q?: string };
  total: number | null;
  /** Count label, pluralized by the total. */
  label: TKey;
  /** Name of the search input. */
  searchName: string;
  allowOfflineSearch?: boolean;
  /** Columns the view menu lists and an export writes; a grid has none. */
  columns?: ColumnOrColumnGroup<TRow>[];
  setColumns?: Dispatch<SetStateAction<ColumnOrColumnGroup<TRow>[]>>;
  /** Buttons before the count, hidden while filtered. */
  actions?: ReactNode;
  /** Rendered after the count. */
  countExtra?: ReactNode;
  /** What the list filters on beside its search words: its search then takes chips and offers them. */
  searchFilters?: SearchFilters;
  sort?: ViewMenuSort;
  export?: ViewMenuExport<TRow>;
  /** Controls of the page's own, such as a view toggle, after the view menu. */
  controls?: ReactNode;
  /** Shows the focus view toggle from `lg` up. Defaults to true. */
  focusView?: boolean;
  /** Slides the closed bar back in on a scroll up, for a long page. */
  sticky?: boolean;
  selection?: { count: number; onClear: () => void; children: ReactNode };
  /** Rendered below the bar. */
  after?: ReactNode;
}

/** The bar above an entity table: actions and count, search, view controls and focus view. */
export function TableBarShell<TRow extends object>({
  isFiltered,
  onSearch,
  onResetFilters,
  searchVars,
  total,
  label,
  searchName,
  allowOfflineSearch,
  columns,
  setColumns,
  actions,
  countExtra,
  searchFilters,
  sort,
  export: exportOptions,
  controls,
  focusView = true,
  sticky,
  selection,
  after,
}: TableBarShellProps<TRow>) {
  const { t } = useTranslation();
  const searchLabel = t('c:placeholder.search_resource', { resource: t(label, { count: 2 }) });
  const foundCount = isFiltered && total !== null ? t('c:resource_count', { count: total, resource: t(label, { count: total }) }) : '';

  return (
    <>
      <TableFilterBar
        searchVars={searchVars}
        isFiltered={isFiltered}
        onResetFilters={onResetFilters}
        sticky={sticky}
        // Beside a view toggle a phone has room for the actions' icons only
        actions={
          !isFiltered &&
          actions &&
          (controls ? (
            <div data-compact className="contents">
              {actions}
            </div>
          ) : (
            actions
          ))
        }
        count={
          <TableCount count={isFiltered ? null : total} label={label}>
            {countExtra}
          </TableCount>
        }
        search={
          searchFilters ? (
            <SearchChipsField
              {...searchFilters}
              name={searchName}
              label={searchLabel}
              value={searchVars.q ?? ''}
              count={foundCount}
              onSearch={onSearch}
              onReset={onResetFilters}
              className="edgeless"
            />
          ) : (
            <TableSearch
              name={searchName}
              label={searchLabel}
              value={searchVars.q}
              count={foundCount}
              onSearch={onSearch}
              allowOfflineSearch={allowOfflineSearch}
            />
          )
        }
        searchLabel={searchLabel}
        controls={
          <>
            <ViewMenu sort={sort} columns={columns} setColumns={setColumns} export={exportOptions} />
            {controls}
            {focusView && <FocusView iconOnly />}
          </>
        }
      />

      {selection && <SelectionActionBar {...selection} />}
      {after}
    </>
  );
}
