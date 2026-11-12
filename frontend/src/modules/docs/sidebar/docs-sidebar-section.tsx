import type { ReactNode } from 'react';
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '~/modules/ui/sidebar';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

/** A sticky tier-1 row's wrapper, opaque so rows scrolling under its translucent hover stay hidden. */
export const sidebarStickyRowClass = tw('bg-card sticky top-2 z-10');

interface SidebarRailProps {
  expanded: boolean;
  /** Draws the line down the children while expanded; a row without children has the bullet alone */
  line?: boolean;
  /** Where the line ends above the next row, as a `bottom-*` class */
  lineClassName: string;
}

/**
 * A collapsible row's rail: a bullet beside the row and, while it is expanded, a line down its children. Render it after
 * the row: inside it, the row's press transform would shift the rail, and before it, a hover or active fill would cover it.
 */
export function SidebarRail({ expanded, line = true, lineClassName }: SidebarRailProps) {
  return (
    <>
      {line && expanded && (
        <div className={cn('no-focus-ring:top-5 bg-muted-foreground/30 pointer-events-none absolute top-4.5 left-2.5 w-px', lineClassName)} />
      )}
      <div
        className={cn(
          'no-focus-ring:top-4 bg-muted-foreground/30 pointer-events-none absolute top-3.5 left-[0.53rem] size-1 rounded-full',
          expanded && 'bg-muted-foreground/60',
        )}
      />
    </>
  );
}

interface DocsSidebarSectionProps {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}

/** A labeled section of the docs sidebar; every section insets its rows alike, so bullets and guidelines align. */
export function DocsSidebarSection({ label, action, children }: DocsSidebarSectionProps) {
  return (
    <SidebarGroup>
      <div className="flex items-center gap-3 px-4 pr-1 pb-1">
        <SidebarGroupLabel className="p-0 text-xs">{label}</SidebarGroupLabel>
        {action}
      </div>
      <SidebarGroupContent>
        <SidebarGroup className="no-focus-ring:gap-0 gap-1 p-1 pt-0">{children}</SidebarGroup>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
