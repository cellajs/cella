import { type Dispatch, type ReactNode, type SetStateAction, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import type { TKey } from '~/lib/i18n-locales';
import { TableCount } from '~/modules/common/data-table/table-count';
import { TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import { TableSearch } from '~/modules/common/data-table/table-search';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { ViewMenu, type ViewMenuExport, type ViewMenuSort } from '~/modules/common/data-table/view-menu';
import type { TriggerRef } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
import type { IconComponent } from '~/modules/common/icons/types';
import { SearchChipsField } from '~/modules/common/search-chips/search-chips-field';
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
  total: number | null;
  /** Count label, pluralized by the total. */
  label: TKey;
  /** Name of the search input. */
  searchName: string;
  allowOfflineSearch?: boolean;
  /** Columns the view menu lists and an export writes; a grid has none. */
  columns?: ColumnOrColumnGroup<TRow>[];
  setColumns?: Dispatch<SetStateAction<ColumnOrColumnGroup<TRow>[]>>;
  /** The list's main action, such as create: before the count, hidden while filtered; on a phone a floating button. */
  action?: TableBarAction;
  /** Floats the action on a phone. Defaults to true; a list in a sheet keeps it in the row. */
  floatAction?: boolean;
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
  const isMobile = useBreakpointBelow('sm');
  const isActionFloating = !!action && floatAction && isMobile;
  const searchLabel = t('c:placeholder.search_resource', { resource: t(label, { count: 2 }) });
  const foundCount = isFiltered && total !== null ? t('c:resource_count', { count: total, resource: t(label, { count: total }) }) : '';

  const searchProps = searchFilters
    ? {
        searchInRow: true as const,
        foundCount,
        search: (
          <SearchChipsField
            {...searchFilters}
            name={searchName}
            label={searchLabel}
            value={searchVars.q ?? ''}
            count={foundCount}
            onSearch={onSearch}
            onReset={onResetFilters}
            compactOnPhone
            className="edgeless"
          />
        ),
      }
    : {
        searchLabel,
        search: (
          <TableSearch
            name={searchName}
            label={searchLabel}
            value={searchVars.q}
            count={foundCount}
            onSearch={onSearch}
            allowOfflineSearch={allowOfflineSearch}
          />
        ),
      };

  return (
    <>
      <TableFilterBar
        searchVars={searchVars}
        isFiltered={isFiltered}
        onResetFilters={onResetFilters}
        sticky={sticky}
        {...searchProps}
        actions={!isFiltered && action && !isActionFloating && <TableBarActionButton action={action} />}
        count={
          <TableCount count={isFiltered ? null : total} label={label}>
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
