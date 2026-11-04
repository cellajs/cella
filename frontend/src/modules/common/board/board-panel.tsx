import type { MouseEvent, ReactNode } from 'react';
import { hintFadeIn, hintFadeOut } from '~/modules/common/resizable-panels/resizable-panels';
import { cn } from '~/utils/cn';
import { formatCount } from '~/utils/format-count';
import { tw } from '~/utils/tw';

interface BoardPanelHeaderProps {
  leading?: ReactNode;
  actions?: ReactNode;
  isCollapsed?: boolean;
  className?: string;
}

export function BoardPanelHeader({ leading, actions, isCollapsed, className }: BoardPanelHeaderProps) {
  return (
    <div
      className={cn(
        'z-50 flex min-h-13 items-center gap-2 rounded-lg rounded-b-none border border-panel-edge border-b-0 p-2 max-sm:hidden',
        className,
      )}
    >
      {leading}
      {!isCollapsed && actions && <div className={cn(hintFadeOut, 'flex grow items-center justify-end gap-2')}>{actions}</div>}
    </div>
  );
}

interface BoardPanelBodyProps {
  children: ReactNode;
  hasSelection?: boolean;
  /** Panel grows with its content, with no fixed viewport height. */
  windowScroll?: boolean;
  className?: string;
  /** The collapsed view's main count, previewed while a resize hint collapses the panel. */
  collapsedCount?: number;
  onMouseEnter?: () => void;
  onFocusCapture?: () => void;
}

export function BoardPanelBody({
  children,
  hasSelection,
  windowScroll,
  className,
  collapsedCount,
  onMouseEnter,
  onFocusCapture,
}: BoardPanelBodyProps) {
  return (
    <div
      className={cn(
        'relative flex max-w-full flex-1 shrink-0 snap-center flex-col border-panel-edge sm:border',
        // Highlight the border when an ancestor wrapper is a hovered drop target
        'group-data-[highlighted=true]/paneldrop:border-primary',
        !windowScroll && 'sm:h-[calc(100dvh-var(--board-panel-offset,146px))]',
        hasSelection && 'is-selected',
        className,
      )}
      onMouseEnter={onMouseEnter}
      onFocusCapture={onFocusCapture}
    >
      {children}
      {collapsedCount !== undefined && (
        <div aria-hidden className={cn(windowScroll ? stickyPreviewCountClass : collapsedCountClass, 'pointer-events-none', hintFadeIn)}>
          {formatCount(collapsedCount)}
        </div>
      )}
    </div>
  );
}

export interface CollapsedSection {
  count: number;
  colorClass: string;
  borderClass: string;
  position: 'top' | 'bottom';
}

interface CollapsedPanelViewProps {
  /** The count in the middle; a panel without one leaves it out. */
  mainCount?: number;
  sections?: CollapsedSection[];
  /** Makes the strip a button that expands the panel. It stays out of the Tab order: the header handle is the panel's stop. */
  expand?: { id: string; label: string; onExpand: (event: MouseEvent<HTMLButtonElement>) => void };
  /** The strip is as tall as the longest list: its counts stay on screen while the page scrolls. */
  windowScroll?: boolean;
  className?: string;
}

const emptySections: CollapsedSection[] = [];

// w-12 is a collapsed panel inside its border, so the expanded preview sits where the collapsed count does
const collapsedCountClass = tw('absolute top-[calc(50%-0.625rem)] left-0 w-12 text-center font-medium text-faint-foreground text-sm');
// Mid-screen in a strip too tall to centre on
const stickyCountClass = tw('sticky top-[calc(50vh-0.625rem)] w-12 text-center font-medium text-faint-foreground text-sm');
// The body ends its flow here, so this pins from below, on the same line as the strip's count
const stickyPreviewCountClass = tw('sticky bottom-[calc(50vh-0.625rem)] h-0 w-12 text-center font-medium text-faint-foreground text-sm');

interface CollapsedSectionsProps {
  sections: CollapsedSection[];
  position: CollapsedSection['position'];
  windowScroll?: boolean;
}

/** The section counts at one end of a collapsed panel. */
function CollapsedSections({ sections, position, windowScroll }: CollapsedSectionsProps) {
  return sections
    .filter((section) => section.position === position)
    .map((section, i) => (
      <div
        // biome-ignore lint/suspicious/noArrayIndexKey: static sections
        key={i}
        className={cn(
          'flex h-9 items-center justify-center p-2 font-medium text-sm',
          windowScroll && 'sticky z-10',
          windowScroll && (position === 'top' ? 'top-[calc(var(--sticky-stack-nav,0px)+var(--sticky-stack-pin,0px))]' : 'bottom-0'),
          section.colorClass,
          section.borderClass,
        )}
      >
        {formatCount(section.count)}
      </div>
    ));
}

export function CollapsedPanelView({ mainCount, sections = emptySections, expand, windowScroll, className }: CollapsedPanelViewProps) {
  const stripClass = cn(
    'relative flex flex-1 snap-center flex-col border-panel-edge group-data-[highlighted=true]/paneldrop:border-primary sm:border',
    className,
  );
  const content = (
    <>
      <CollapsedSections sections={sections} position="top" windowScroll={windowScroll} />
      {windowScroll && mainCount !== undefined && <div className={cn(stickyCountClass, hintFadeOut)}>{formatCount(mainCount)}</div>}
      <div className="grow" />
      {!windowScroll && mainCount !== undefined && <div className={cn(collapsedCountClass, hintFadeOut)}>{formatCount(mainCount)}</div>}
      <CollapsedSections sections={sections} position="bottom" windowScroll={windowScroll} />
    </>
  );

  if (!expand) return <div className={stripClass}>{content}</div>;

  return (
    <button
      type="button"
      id={expand.id}
      aria-label={expand.label}
      tabIndex={-1}
      onClick={expand.onExpand}
      // An outline, not the inset ring: the section counts at the strip's ends would paint over an inset ring
      className={cn(
        stripClass,
        'cursor-pointer outline-hidden focus-ring:focus-visible:outline-2 focus-ring:focus-visible:outline-ring focus-ring:focus-visible:outline-solid focus-ring:focus-visible:-outline-offset-2',
      )}
    >
      {content}
    </button>
  );
}
