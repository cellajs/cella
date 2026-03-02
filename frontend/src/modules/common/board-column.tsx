import type { ReactNode } from 'react';
import { cn } from '~/utils/cn';

export interface BoardColumnHeaderProps {
  leading?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  isCollapsed?: boolean;
  className?: string;
}

export function BoardColumnHeader({ leading, title, actions, isCollapsed, className }: BoardColumnHeaderProps) {
  return (
    <div
      className={cn(
        'min-h-15 max-sm:hidden border border-b-0 p-2 rounded-lg rounded-b-none flex flex-row gap-2 space-between items-center bg-background z-50',
        className,
      )}
    >
      {leading}
      {!isCollapsed && title}
      {!isCollapsed && actions && (
        <>
          <div className="grow hidden sm:block" />
          {actions}
        </>
      )}
    </div>
  );
}

export interface BoardColumnBodyProps {
  children: ReactNode;
  highlighted?: boolean;
  hasSelection?: boolean;
  /** When true, column grows with content (no fixed viewport height) */
  windowScroll?: boolean;
  className?: string;
  columnRef?: React.Ref<HTMLDivElement>;
  topSlot?: ReactNode;
  bottomSlot?: ReactNode;
}

export function BoardColumnBody({
  children,
  highlighted,
  hasSelection,
  windowScroll,
  className,
  columnRef,
  topSlot,
  bottomSlot,
}: BoardColumnBodyProps) {
  return (
    <div
      className={cn(
        'flex-1 relative rounded-b-none max-w-full bg-transparent group/column flex flex-col shrink-0 snap-center opacity-100 sm:border',
        !windowScroll && 'sm:h-[calc(100vh-146px)]',
        hasSelection && 'is-selected',
        highlighted && 'border-primary',
        className,
      )}
      ref={columnRef}
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

export interface CollapsedColumnViewProps {
  mainCount: number;
  sections?: CollapsedSection[];
  className?: string;
}

export function CollapsedColumnView({ mainCount, sections = [], className }: CollapsedColumnViewProps) {
  const topSections = sections.filter((s) => s.position === 'top');
  const bottomSections = sections.filter((s) => s.position === 'bottom');

  return (
    <div className={cn('flex-1 relative bg-transparent flex flex-col snap-center sm:border', className)}>
      {topSections.map((section, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static sections
          key={`top-${i}`}
          className={cn('flex p-2 h-8 justify-center items-center text-xs', section.colorClass, section.borderClass)}
        >
          {section.count}
        </div>
      ))}

      <div className="flex grow justify-center items-center text-gray-500 text-xs">
        <div className="absolute top-[calc(50%-0.5rem)]">{mainCount}</div>
      </div>

      {bottomSections.map((section, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static sections
          key={`bottom-${i}`}
          className={cn('flex p-2 h-8 justify-center items-center text-xs', section.colorClass, section.borderClass)}
        >
          {section.count}
        </div>
      ))}
    </div>
  );
}
