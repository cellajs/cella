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
        'border-panel-edge z-50 flex min-h-13 items-center gap-2 rounded-lg rounded-b-none border border-b-0 p-2 max-sm:hidden',
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
  className?: string;
  /** The collapsed view's main count, previewed while a resize hint collapses the panel. */
  collapsedCount?: number;
}

export function BoardPanelBody({ children, hasSelection, className, collapsedCount }: BoardPanelBodyProps) {
  return (
    <div
      className={cn(
        'border-panel-edge relative flex max-w-full flex-1 shrink-0 snap-center flex-col sm:border',
        'group-data-[highlighted=true]/paneldrop:border-primary sm:h-[calc(100dvh-var(--board-panel-offset,146px))]',
        hasSelection && 'is-selected',
        className,
      )}
    >
      {children}
      {collapsedCount !== undefined && (
        <div aria-hidden className={cn(collapsedCountClass, 'pointer-events-none', hintFadeIn)}>
          <span className="strip-fade">{formatCount(collapsedCount)}</span>
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
  /** The count in the middle */
  mainCount?: number;
  sections?: CollapsedSection[];
  /** Makes the strip a button that expands the panel. It stays out of the Tab order: the header handle is the panel's stop. */
  expand?: { id: string; label: string; onExpand: (event: MouseEvent<HTMLButtonElement>) => void };
  className?: string;
}

const emptySections: CollapsedSection[] = [];

// The expanded preview sits where the collapsed count does: w-11 is a collapsed panel inside its border
const collapsedCountClass = tw('text-faint-foreground absolute top-[calc(50%-0.625rem)] left-0 w-11 text-center text-sm font-medium');

interface CollapsedSectionsProps {
  sections: CollapsedSection[];
  position: CollapsedSection['position'];
}

function CollapsedSections({ sections, position }: CollapsedSectionsProps) {
  return sections
    .filter((section) => section.position === position)
    .map((section, i) => (
      <div
        // biome-ignore lint/suspicious/noArrayIndexKey: static sections
        key={i}
        className={cn('strip-fade flex h-9 items-center justify-center p-2 text-sm font-medium', section.colorClass, section.borderClass)}
      >
        {formatCount(section.count)}
      </div>
    ));
}

export function CollapsedPanelView({ mainCount, sections = emptySections, expand, className }: CollapsedPanelViewProps) {
  const stripClass = cn(
    'group/strip border-panel-edge group-data-[highlighted=true]/paneldrop:border-primary relative flex flex-1 snap-center flex-col sm:border',
    className,
  );
  // The main count's own opacity belongs to hintFadeOut. The rest fade sits on an inner span.
  const mainCountText = mainCount !== undefined && <span className="strip-fade">{formatCount(mainCount)}</span>;
  const content = (
    <>
      <CollapsedSections sections={sections} position="top" />
      <div className="grow" />
      {mainCountText && <div className={cn(collapsedCountClass, hintFadeOut)}>{mainCountText}</div>}
      <CollapsedSections sections={sections} position="bottom" />
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
        'focus-ring:focus-visible:outline-2 focus-ring:focus-visible:outline-ring focus-ring:focus-visible:outline-solid focus-ring:focus-visible:-outline-offset-2 cursor-pointer outline-hidden',
      )}
    >
      {content}
    </button>
  );
}
