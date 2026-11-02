import { SearchIcon } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useBreakpointAbove } from '~/hooks/use-breakpoints';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { SearchCloseButton } from '~/modules/common/search-clear-button';
import { StickyBox, scrollToPinLine } from '~/modules/common/sticky-box';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

// The look of the closed row's search button, so its icon and placeholder hold still when it opens into the panel
const panelFieldClass = tw(
  '[&_[data-slot=input-group-addon]_svg]:size-5 [&_[data-slot=input-group-addon]_svg]:opacity-100 [&_input]:text-base [&_input]:placeholder:text-muted-foreground',
);

/** Where the search goes on a phone. */
type TableFilterBarSearch =
  | {
      /** Names the phone's search button, as the field's own label does: "Search organizations". */
      searchLabel: string;
      searchInRow?: false;
      foundCount?: never;
      wideSearch?: never;
    }
  | {
      searchLabel?: never;
      /** A search that opens itself on a phone and shows its filters while closed: it stays in the row, which pins while filtered. */
      searchInRow: true;
      /** What the search finds, as "4 tasks": on a phone it shows below the filtered row. */
      foundCount: string;
      /** For a page whose search is its main control: the field fills the row ahead of the count. */
      wideSearch?: boolean;
    };

type TableFilterBarProps = TableFilterBarSearch & {
  /** Buttons before the count, such as a create button. */
  actions?: ReactNode;
  count?: ReactNode;
  /** The search field: in the row from `sm` up, behind a search button on a phone unless `searchInRow`. */
  search: ReactNode;
  /** View controls closing the row, such as a view toggle and the view menu; a phone's open search leaves them out. */
  controls?: ReactNode;
  isFiltered?: boolean;
  onResetFilters: () => void;
  searchVars?: Record<string, unknown>;
  /** Slides the closed bar back in on a scroll up, for a long page. */
  sticky?: boolean;
};

/**
 * The bar above a list. From `sm` up one row: actions and count, search, controls, and the count steps aside while the
 * search has focus. On a phone the search is a button that opens a panel pinned at the top of the screen over the page
 * tabs, the field with a close X, while the list filters underneath. The X clears a search first and closes the panel on
 * the next press, so a filtered bar opens with its panel open. A `searchInRow` search stays in the row on a phone, with
 * what it found and a way to clear it below that row.
 */
export function TableFilterBar({
  actions,
  count,
  search,
  searchLabel,
  searchInRow,
  foundCount,
  controls,
  isFiltered,
  onResetFilters,
  searchVars,
  sticky,
  wideSearch,
}: TableFilterBarProps) {
  const { t } = useTranslation();
  const isDesktop = useBreakpointAbove('sm');
  const barRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(!!isFiltered);
  const isPanel = !isDesktop && !searchInRow && isOpen;
  const isPinnedRow = !isDesktop && !!searchInRow && !!isFiltered;

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
    if (isFiltered) return onResetFilters();
    setIsOpen(false);
  };

  // No box of its own around the count: a wrapper left displayed around a hidden or empty count would still take the row's gap
  const countNode = count && <div className="contents group-has-[input:focus]/table-bar:hidden">{count}</div>;
  const start = actions ? (
    <div className="flex min-w-0 items-center gap-3">
      {actions}
      {countNode}
    </div>
  ) : (
    countNode
  );

  if (isPanel) {
    return (
      <TableBarContainer ref={barRef} searchVars={searchVars} pinned className="items-start gap-1 border-b">
        <div className={cn('min-w-0 grow', panelFieldClass)}>{search}</div>
        <div className="flex h-10 shrink-0 items-center">
          <SearchCloseButton
            aria-label={isFiltered ? t('c:clear_search') : t('c:close')}
            // Keeps focus in the input, so a cleared search leaves the keyboard up to type the next one
            onMouseDown={(event) => event.preventDefault()}
            onClick={close}
          />
        </div>
      </TableBarContainer>
    );
  }

  const row = (
    <TableBarContainer ref={barRef} searchVars={searchVars} pinned={isPinnedRow} className="group/table-bar">
      {wideSearch ? (
        <>
          <div className="min-w-0 grow">{search}</div>
          {start}
        </>
      ) : (
        <>
          {start}
          <div className={cn('ml-auto flex min-w-0 items-center gap-2', isPinnedRow && 'grow')}>
            {isDesktop || searchInRow ? (
              search
            ) : (
              <Button variant="outline" size="icon" aria-label={searchLabel} onClick={open}>
                <SearchIcon />
              </Button>
            )}
          </div>
        </>
      )}
      {controls}
    </TableBarContainer>
  );

  // Around the row alone: the open panel pins to its parent, and would stretch this box to a full screen. Not around a phone's
  // search in the row: it pins by itself once filtered, and wrapping it then would remount the search
  if (sticky && (isDesktop || !searchInRow)) {
    return (
      <StickyBox hideWhenOutOfView className="z-10 bg-background">
        {row}
      </StickyBox>
    );
  }

  return (
    <>
      {row}
      {isPinnedRow && (
        <div className="flex h-11 items-center justify-between border-b text-muted-foreground text-sm tabular-nums">
          {foundCount}
          <Button variant="ghost" size="sm" onClick={onResetFilters}>
            {t('c:clear_all')}
          </Button>
        </div>
      )}
    </>
  );
}
