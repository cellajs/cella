import type { ReactNode } from 'react';
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '~/modules/ui/sidebar';
import { tw } from '~/utils/tw';

/** A sticky tier-1 row's wrapper: its opaque fill hides the rows scrolling under it, also behind the ghost hover, translucent in dark mode. */
export const sidebarStickyRowClass = tw('sticky top-2 z-10 bg-card');

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
        <SidebarGroupLabel className="p-0">{label}</SidebarGroupLabel>
        {action}
      </div>
      <SidebarGroupContent>
        <SidebarGroup className="gap-1 p-1 pt-0">{children}</SidebarGroup>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
