import type { ReactNode } from 'react';
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '~/modules/ui/sidebar';

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
        <SidebarGroupLabel className="p-0 text-muted-foreground lowercase">{label}</SidebarGroupLabel>
        {action}
      </div>
      <SidebarGroupContent>
        <SidebarGroup className="gap-1 p-1 pt-0">{children}</SidebarGroup>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
