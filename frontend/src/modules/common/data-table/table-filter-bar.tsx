import { SearchIcon } from 'lucide-react';
import { createContext, type ReactNode, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useBreakpointAbove } from '~/hooks/use-breakpoints';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { scrollToPinLine } from '~/modules/common/sticky-box';
import { Button } from '~/modules/ui/button';

interface TableFilterBarProps {
  /** Buttons before the count, such as a create button. */
  actions?: ReactNode;
  count?: ReactNode;
  /** The search field: in the row from `sm` up, behind a search button on a phone. */
  search: ReactNode;
  /** Names the phone's search button, as the field's own label does: "Search organizations". */
  searchLabel: string;
  /** Beside the search from `sm` up, on a second row of the open search on a phone. */
  filters?: ReactNode;
  /** View controls closing the row, such as a view toggle and the view menu; a phone's open search leaves them out. */
  controls?: ReactNode;
  isFiltered?: boolean;
  onResetFilters: () => void;
  searchVars?: Record<string, unknown>;
}

/** True while a phone's search is open, so its field takes focus. */
export const TableFilterBarContext = createContext<{ isFilterActive: boolean }>({ isFilterActive: false });

/**
 * The bar above a list. From `sm` up one row: actions and count, search, filters, controls. On a phone the search is a
 * button; it opens a panel pinned at the top of the screen over the page tabs, the field with Cancel above any filters,
 * while the list filters underneath and the count opens it. Cancel resets the filters, so a filtered bar opens with its
 * panel open.
 */
export function TableFilterBar({
  actions,
  count,
  search,
  searchLabel,
  filters,
  controls,
  isFiltered,
  onResetFilters,
  searchVars,
}: TableFilterBarProps) {
  const { t } = useTranslation();
  const isDesktop = useBreakpointAbove('sm');
  const barRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(!!isFiltered);
  const isPanel = !isDesktop && isOpen;

  // Rendered within the tap, so the field takes focus inside the gesture: iOS opens its keyboard for no later focus.
  // A link that opens the bar filtered skips this and leaves the page where it is.
  const open = () => {
    flushSync(() => setIsOpen(true));
    const bar = barRef.current;
    if (!bar) return;
    scrollToPinLine(bar);
    bar.querySelector('input')?.focus({ preventScroll: true });
  };

  const cancel = () => {
    if (isFiltered) onResetFilters();
    setIsOpen(false);
  };

  return (
    <TableFilterBarContext.Provider value={{ isFilterActive: isPanel }}>
      {isPanel ? (
        <>
          <TableBarContainer ref={barRef} searchVars={searchVars} pinned className="flex-col items-stretch gap-1 border-b">
            <div className="flex items-center gap-1">
              <div className="min-w-0 grow">{search}</div>
              <Button variant="ghost" onClick={cancel}>
                {t('c:cancel')}
              </Button>
            </div>
            {filters && <div className="flex items-center gap-2">{filters}</div>}
          </TableBarContainer>
          {/* The first line of the list it counts, read while typing and scrolled away with the rows */}
          {count && <div className="pt-2">{count}</div>}
        </>
      ) : (
        <TableBarContainer ref={barRef} searchVars={searchVars}>
          <div className="flex min-w-0 items-center gap-3">
            {actions}
            {count}
          </div>
          <div className="grow" />
          {isDesktop ? (
            <>
              <div className="flex items-center gap-2">{search}</div>
              {filters && <div className="flex items-center gap-2">{filters}</div>}
            </>
          ) : (
            <Button variant="outline" size="icon" aria-label={searchLabel} onClick={open}>
              <SearchIcon />
            </Button>
          )}
          {controls}
        </TableBarContainer>
      )}
    </TableFilterBarContext.Provider>
  );
}
