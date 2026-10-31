import { SearchIcon } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useBreakpointAbove } from '~/hooks/use-breakpoints';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { SearchCloseButton } from '~/modules/common/search-clear-button';
import { StickyBox, scrollToPinLine } from '~/modules/common/sticky-box';
import { Button } from '~/modules/ui/button';

interface TableFilterBarProps {
  /** Buttons before the count, such as a create button. */
  actions?: ReactNode;
  count?: ReactNode;
  /** The search field: in the row from `sm` up, behind a search button on a phone. */
  search: ReactNode;
  /** Names the phone's search button, as the field's own label does: "Search organizations". */
  searchLabel: string;
  /** View controls closing the row, such as a view toggle and the view menu; a phone's open search leaves them out. */
  controls?: ReactNode;
  isFiltered?: boolean;
  onResetFilters: () => void;
  searchVars?: Record<string, unknown>;
  /** Slides the closed bar back in on a scroll up, for a long page. */
  sticky?: boolean;
}

/**
 * The bar above a list. From `sm` up one row: actions and count, search, controls, and the count steps aside while the
 * search has focus. On a phone the search is a button; it opens a panel pinned at the top of the screen over the page
 * tabs, the field with a close X, while the list filters underneath. The X resets the filters, so a filtered bar opens with
 * its panel open.
 */
export function TableFilterBar({
  actions,
  count,
  search,
  searchLabel,
  controls,
  isFiltered,
  onResetFilters,
  searchVars,
  sticky,
}: TableFilterBarProps) {
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

  const close = () => {
    if (isFiltered) onResetFilters();
    setIsOpen(false);
  };

  const closedBar = (
    <TableBarContainer ref={barRef} searchVars={searchVars} className="group/table-bar">
      <div className="flex min-w-0 items-center gap-3">
        {actions}
        {count && <div className="group-has-[input:focus]/table-bar:hidden">{count}</div>}
      </div>
      <div className="grow" />
      {isDesktop ? (
        <div className="flex items-center gap-2">{search}</div>
      ) : (
        <Button variant="outline" size="icon" aria-label={searchLabel} onClick={open}>
          <SearchIcon />
        </Button>
      )}
      {controls}
    </TableBarContainer>
  );

  if (isPanel) {
    return (
      <TableBarContainer ref={barRef} searchVars={searchVars} pinned className="items-start gap-1 border-b">
        <div className="min-w-0 grow">{search}</div>
        <div className="flex h-10 shrink-0 items-center">
          <SearchCloseButton onClick={close} />
        </div>
      </TableBarContainer>
    );
  }

  // Around the closed row alone: the open panel pins to its parent, and would stretch this box to a full screen
  return sticky ? (
    <StickyBox hideWhenOutOfView className="z-10 bg-background">
      {closedBar}
    </StickyBox>
  ) : (
    closedBar
  );
}
