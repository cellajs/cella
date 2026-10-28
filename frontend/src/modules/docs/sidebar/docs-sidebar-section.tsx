import type { ReactNode } from 'react';
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '~/modules/ui/sidebar';
import { tw } from '~/utils/tw';

/** A sticky tier-1 row's wrapper: its opaque fill hides the rows scrolling under it, also behind the ghost hover, translucent in dark mode. */
export const sidebarStickyRowClass = tw('sticky top-2 z-10 bg-card');

/**
 * The bullet on the rail of an `h-8` collapsible row, darker while open. It sits in the row's `data-expanded` item, beside
 * the row: inside it, the row's press transform would become its containing block and shift it off the rail.
 */
export const sidebarBulletClass = tw(
  'pointer-events-none absolute top-3.5 left-[0.53rem] size-1 rounded-full bg-muted-foreground/30 [[data-expanded=true]>&]:bg-muted-foreground/60',
);

interface DocsSidebarSectionProps {
  label: string;
  /** Sits at the end of the label row. */
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
        <SidebarGroup className="gap-1 p-1 pt-0">{children}</SidebarGroup>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
