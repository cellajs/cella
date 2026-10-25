import type { ReactNode } from 'react';
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
    <div className={cn('z-50 flex min-h-13 items-center gap-2 rounded-lg rounded-b-none border border-b-0 p-2 max-sm:hidden', className)}>
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
        'relative flex max-w-full flex-1 shrink-0 snap-center flex-col sm:border',
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
        <div aria-hidden className={cn(collapsedCountClass, 'pointer-events-none', hintFadeIn)}>
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
  mainCount: number;
  sections?: CollapsedSection[];
}

const emptySections: CollapsedSection[] = [];

// w-12 is a collapsed panel inside its border, so the expanded preview sits where the collapsed count does
const collapsedCountClass = tw('absolute top-[calc(50%-0.5rem)] left-0 w-12 text-center text-muted-foreground text-xs');

interface CollapsedSectionsProps {
  sections: CollapsedSection[];
  position: CollapsedSection['position'];
}

/** The section counts at one end of a collapsed panel. */
function CollapsedSections({ sections, position }: CollapsedSectionsProps) {
  return sections
    .filter((section) => section.position === position)
    .map((section, i) => (
      <div
        // biome-ignore lint/suspicious/noArrayIndexKey: static sections
        key={i}
        className={cn('flex h-9 items-center justify-center p-2 text-xs', section.colorClass, section.borderClass)}
      >
        {formatCount(section.count)}
      </div>
    ));
}

export function CollapsedPanelView({ mainCount, sections = emptySections }: CollapsedPanelViewProps) {
  return (
    <div className="relative flex flex-1 snap-center flex-col group-data-[highlighted=true]/paneldrop:border-primary sm:border">
      <CollapsedSections sections={sections} position="top" />
      <div className="grow" />
      <div className={cn(collapsedCountClass, hintFadeOut)}>{formatCount(mainCount)}</div>
      <CollapsedSections sections={sections} position="bottom" />
    </div>
  );
}
