import { type Dispatch, type ReactNode, type SetStateAction, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import type { TKey } from '~/lib/i18n-locales';
import { TableBarSearch } from '~/modules/common/data-table/table-bar-search';
import { TableCount } from '~/modules/common/data-table/table-count';
import { TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { ViewMenu, type ViewMenuExport, type ViewMenuSort } from '~/modules/common/data-table/view-menu';
import type { TriggerRef } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
import type { IconComponent } from '~/modules/common/icons/types';
import { countText } from '~/modules/common/search-chips/count-text';
import type { SearchFilters } from '~/modules/common/search-chips/types';
import { SelectionActionBar } from '~/modules/common/selection-action-bar';
import { FloatingAction } from '~/modules/navigation/floating-nav/floating-action';
import { Button } from '~/modules/ui/button';

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
    if (current === undefined) return false;
    // A filter over a list of values resets to an empty list, and no two empty lists are one object: its length decides.
    if (Array.isArray(current)) return current.length > 0;
    return current !== value;
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

export interface TableBarAction {
  icon: IconComponent;
  /** Translated, such as "Invite"; a phone row keeps it for screen readers only. */
  label: string;
  /** Receives the button, which a dialog it opens returns focus to. */
  onClick: (triggerRef: TriggerRef) => void;
}

/** A list's main action in its bar row: a phone has room for its icon only. */
export function TableBarActionButton({ action }: { action: TableBarAction }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { icon: Icon, label, onClick } = action;

  return (
    <Button ref={ref} onClick={() => onClick(ref)}>
      <Icon />
      <span className="max-sm:sr-only">{label}</span>
    </Button>
  );
}

interface TableBarShellProps<TRow extends object> extends ReturnType<typeof useTableBarFilters> {
  searchVars: { q?: string };
  /** The list's count, of what the search finds while it filters; null while it loads. */
  total: number | null;
  /** Count label, pluralized by the total. */
  label: TKey;
  /** Name of the search input. */
  searchName: string;
  allowOfflineSearch?: boolean;
  /** Columns the view menu lists and an export writes; a grid has none. */
  columns?: ColumnOrColumnGroup<TRow>[];
  setColumns?: Dispatch<SetStateAction<ColumnOrColumnGroup<TRow>[]>>;
  /** Before the count; on a phone a floating button */
  action?: TableBarAction;
  /** False keeps the action in the row on a phone, as a list in a sheet does */
  floatAction?: boolean;
  countExtra?: ReactNode;
  /** What the list filters on beside its search words, offered in the search's popup. */
  searchFilters?: SearchFilters;
  sort?: ViewMenuSort;
  export?: ViewMenuExport<TRow>;
  /** After the view menu */
  controls?: ReactNode;
  /** Shows the focus view toggle from `lg` up */
  focusView?: boolean;
  sticky?: boolean;
  selection?: { count: number; onClear: () => void; children: ReactNode };
  /** Rendered below the bar */
  after?: ReactNode;
}

const noFilters: SearchFilters = { groups: [], chips: [] };

/** The bar above an entity table: action and count, search, view controls and focus view. */
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
  action,
  floatAction = true,
  countExtra,
  searchFilters = noFilters,
  sort,
  export: exportOptions,
  controls,
  focusView = true,
  sticky,
  selection,
  after,
}: TableBarShellProps<TRow>) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm');
  const isActionFloating = !!action && floatAction && isMobile;

  // The last count known: a search on its way shows the one before it, while the field's spinner says it is coming
  const [shownTotal, setShownTotal] = useState(total);
  if (total !== null && total !== shownTotal) setShownTotal(total);
  const resultCount = shownTotal === null ? undefined : { count: shownTotal, resource: label };
  // Empty for no results: the list's empty state says so and offers the clear
  const foundCount = isFiltered && resultCount?.count ? countText(t, resultCount, { found: true }) : '';

  return (
    <>
      <TableFilterBar
        searchVars={searchVars}
        isFiltered={isFiltered}
        onResetFilters={onResetFilters}
        sticky={sticky}
        foundCount={foundCount}
        search={
          <TableBarSearch
            {...searchFilters}
            isFiltered={isFiltered}
            allowOfflineSearch={allowOfflineSearch}
            name={searchName}
            label={t('c:placeholder.search_list')}
            value={searchVars.q ?? ''}
            resultCount={resultCount}
            onSearch={onSearch}
            onReset={onResetFilters}
          />
        }
        actions={action && !isActionFloating && <TableBarActionButton action={action} />}
        count={
          <TableCount count={shownTotal} found={isFiltered} label={label}>
            {countExtra}
          </TableCount>
        }
        controls={
          <>
            <ViewMenu sort={sort} columns={columns} setColumns={setColumns} export={exportOptions} />
            {controls}
            {focusView && <FocusView iconOnly />}
          </>
        }
      />

      {isActionFloating && <FloatingAction {...action} />}
      {selection && <SelectionActionBar {...selection} />}
      {after}
    </>
  );
}
