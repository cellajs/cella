import type { ReactNode } from 'react';
import { hintFadeIn, hintFadeOut } from '~/modules/common/resizable-panels/resizable-panels';
import { cn } from '~/utils/cn';

interface BoardPanelHeaderProps {
  leading?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  isCollapsed?: boolean;
  className?: string;
}

export function BoardPanelHeader({ leading, title, actions, isCollapsed, className }: BoardPanelHeaderProps) {
  return (
    <div className={cn('z-50 flex min-h-13 flex-row items-center gap-2 rounded-lg rounded-b-none border border-b-0 p-2 max-sm:hidden', className)}>
      {leading}
      {!isCollapsed && title && <div className={cn('min-w-0', hintFadeOut)}>{title}</div>}
      {!isCollapsed && actions && <div className={cn('flex grow items-center justify-end gap-2', hintFadeOut)}>{actions}</div>}
    </div>
  );
}

interface BoardPanelBodyProps {
  children: ReactNode;
  hasSelection?: boolean;
  /** Panel grows with its content, with no fixed viewport height. */
  windowScroll?: boolean;
  className?: string;
  panelRef?: React.Ref<HTMLDivElement>;
  topSlot?: ReactNode;
  bottomSlot?: ReactNode;
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
  panelRef,
  topSlot,
  bottomSlot,
  collapsedCount,
  onMouseEnter,
  onFocusCapture,
}: BoardPanelBodyProps) {
  return (
    <div
      className={cn(
        'group/panel relative flex max-w-full flex-1 shrink-0 snap-center flex-col rounded-b-none bg-transparent opacity-100 sm:border',
        // Highlight the border when an ancestor wrapper is a hovered drop target
        'group-data-[highlighted=true]/paneldrop:border-primary',
        !windowScroll && 'sm:h-[calc(100dvh-var(--board-panel-offset,146px))]',
        hasSelection && 'is-selected',
        className,
      )}
      ref={panelRef}
      onMouseEnter={onMouseEnter}
      onFocusCapture={onFocusCapture}
    >
      {topSlot}
      {children}
      {bottomSlot}
      {collapsedCount !== undefined && (
        <div aria-hidden className={cn(collapsedCountClass, 'pointer-events-none', hintFadeIn)}>
          {collapsedCount}
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
  className?: string;
}

const EMPTY_SECTIONS: CollapsedSection[] = [];

// w-12 is a collapsed panel inside its border, so the expanded preview sits where the collapsed count does
const collapsedCountClass = 'absolute top-[calc(50%-0.5rem)] left-0 w-12 text-center text-muted-foreground text-xs';

export function CollapsedPanelView({ mainCount, sections = EMPTY_SECTIONS, className }: CollapsedPanelViewProps) {
  const topSections = sections.filter((s) => s.position === 'top');
  const bottomSections = sections.filter((s) => s.position === 'bottom');

  return (
    <div
      className={cn(
        'relative flex flex-1 snap-center flex-col bg-transparent sm:border',
        'group-data-[highlighted=true]/paneldrop:border-primary',
        className,
      )}
    >
      {topSections.map((section, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static sections
          key={`top-${i}`}
          className={cn('flex h-9 items-center justify-center p-2 text-xs', section.colorClass, section.borderClass)}
        >
          {section.count}
        </div>
      ))}

      <div className="grow" />
      <div className={cn(collapsedCountClass, hintFadeOut)}>{mainCount}</div>

      {bottomSections.map((section, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static sections
          key={`bottom-${i}`}
          className={cn('flex h-9 items-center justify-center p-2 text-xs', section.colorClass, section.borderClass)}
        >
          {section.count}
        </div>
      ))}
    </div>
  );
}
