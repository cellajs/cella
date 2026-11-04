import type { ReactNode } from 'react';
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '~/modules/ui/sidebar';
import { tw } from '~/utils/tw';

/** A sticky tier-1 row's wrapper, opaque so rows scrolling under its translucent hover stay hidden. */
export const sidebarStickyRowClass = tw('bg-card sticky top-2 z-10');

/** A collapsible row's rail bullet, beside the row: inside it, the row's press transform would shift it off the rail. */
export const sidebarBulletClass = tw(
  'no-focus-ring:top-4 bg-muted-foreground/30 [[data-expanded=true]>&]:bg-muted-foreground/60 pointer-events-none absolute top-3.5 left-[0.53rem] size-1 rounded-full',
);

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
