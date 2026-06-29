import type { ReactNode } from 'react';
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
    <div
      className={cn(
        'space-between z-50 flex min-h-13 flex-row items-center gap-2 rounded-lg rounded-b-none border border-b-0 p-2 max-sm:hidden',
        className,
      )}
    >
      {leading}
      {!isCollapsed && title}
      {!isCollapsed && actions && (
        <>
          <div className="hidden grow sm:block" />
          {actions}
        </>
      )}
    </div>
  );
}

interface BoardPanelBodyProps {
  children: ReactNode;
  hasSelection?: boolean;
  /** When true, panel grows with content (no fixed viewport height) */
  windowScroll?: boolean;
  className?: string;
  panelRef?: React.Ref<HTMLDivElement>;
  topSlot?: ReactNode;
  bottomSlot?: ReactNode;
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
  onMouseEnter,
  onFocusCapture,
}: BoardPanelBodyProps) {
  return (
    <div
      className={cn(
        'group/panel relative flex max-w-full flex-1 shrink-0 snap-center flex-col rounded-b-none bg-transparent opacity-100 sm:border',
        // Highlight border when an ancestor wrapper is marked as a drop-target hover (see board-panel.tsx)
        'group-data-[highlighted=true]/paneldrop:border-primary',
        !windowScroll && 'sm:h-[calc(100vh-146px)]',
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

export function CollapsedPanelView({ mainCount, sections = EMPTY_SECTIONS, className }: CollapsedPanelViewProps) {
  const topSections = sections.filter((s) => s.position === 'top');
  const bottomSections = sections.filter((s) => s.position === 'bottom');

  return (
    <div
      className={cn(
        'relative flex flex-1 snap-center flex-col bg-transparent sm:border',
        // Highlight border when an ancestor wrapper is marked as a drop-target hover (see board-panel.tsx)
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

      <div className="flex grow items-center justify-center text-gray-500 text-xs">
        <div className="absolute top-[calc(50%-0.5rem)]">{mainCount}</div>
      </div>

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
