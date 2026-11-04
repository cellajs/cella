import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { StickyBox } from '~/modules/common/sticky-box';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface TableFilterBarProps {
  /** Buttons before the count, such as a create button. */
  actions?: ReactNode;
  count?: ReactNode;
  /** The search field: in the row, also on a phone, where it opens as a dialog. */
  search: ReactNode;
  /** What the search finds, as "3 tasks found": below `lg` it shows below the filtered row. Empty leaves that line out. */
  foundCount: string;
  /** For a view whose search is its main control: the field fills the row and holds the count itself, so leave `count` out. */
  wideSearch?: boolean;
  /** View controls closing the row, such as a view toggle and the view menu. */
  controls?: ReactNode;
  isFiltered?: boolean;
  onResetFilters: () => void;
  searchVars?: Record<string, unknown>;
  /** Slides the closed bar back in on a scroll up, for a long page. */
  sticky?: boolean;
}

/**
 * The bar above a list: actions and count, search, controls. A search fills the row (`wideSearch`) or keeps one width
 * beside the count. From `lg` up the row keeps every part while the search is in use or filters. Below `lg` a narrow
 * search in use or filtering takes the row, and a filtered row shows what it found and a way to clear it on a line below;
 * on a phone that row pins under the page tabs.
 */
export function TableFilterBar({
  actions,
  count,
  search,
  foundCount,
  wideSearch,
  controls,
  isFiltered,
  onResetFilters,
  searchVars,
  sticky,
}: TableFilterBarProps) {
  const { t } = useTranslation();
  const isPhone = useBreakpointBelow('sm');
  const isCompact = useBreakpointBelow('lg');
  const isPinnedRow = isPhone && !!isFiltered;
  const hasFoundLine = isPinnedRow || (isCompact && !!isFiltered && !wideSearch);

  // Below `lg` what stands before the search steps aside while it is in use; while it filters the line below holds the count
  const startClass = 'max-lg:group-has-[[data-in-use]]/table-bar:hidden';
  const start = hasFoundLine ? null : actions ? (
    <div className={cn('flex min-w-0 items-center gap-3', startClass)}>
      {actions}
      {count}
    </div>
  ) : (
    // No box of its own: `contents` keeps a hidden or empty count out of the row's gap
    count && <div className={cn('contents', startClass)}>{count}</div>
  );

  const row = (
    <TableBarContainer searchVars={searchVars} pinned={isPinnedRow} className="group/table-bar">
      {wideSearch ? (
        <>
          <div className="min-w-0 grow">{search}</div>
          {start}
        </>
      ) : (
        <>
          {start}
          {/* The free room of the row, so a field can take what it needs of it */}
          <div className="flex min-w-0 grow items-center justify-end gap-2">{search}</div>
        </>
      )}
      {controls}
    </TableBarContainer>
  );

  const foundLine = hasFoundLine && foundCount && (
    <div className="flex h-11 items-center gap-1.5 border-b text-muted-foreground text-sm tabular-nums">
      <span role="status">{foundCount}</span>
      <span aria-hidden>·</span>
      {/* Its text as far from the dot as the count is: the padding is the hover's room */}
      <Button variant="ghost" size="sm" onClick={onResetFilters} className="-ml-1.5 px-1.5">
        {t('c:clear_all')}
      </Button>
    </div>
  );

  // Not around a phone's row: it pins by itself once filtered, and wrapping it then would remount the search
  // Above a pinned grid header (z-20), so the field's options stay over it, and below the page tabs (z-80)
  if (sticky && !isPhone) {
    return (
      <StickyBox hideWhenOutOfView className="z-30 bg-background">
        {row}
        {foundLine}
      </StickyBox>
    );
  }

  return (
    <>
      {row}
      {foundLine}
    </>
  );
}
