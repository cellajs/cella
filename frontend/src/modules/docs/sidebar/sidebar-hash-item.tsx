import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { docsSidebarSheetId } from '~/modules/docs/sidebar/close-sidebar-sheet';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { isModifiedClick } from '~/utils/is-modified-click';
import { tw } from '~/utils/tw';

interface SidebarHashItemProps {
  to: '/docs/operations' | '/docs/schemas';
  hash: string;
  isActive: boolean;
  className?: string;
  children: ReactNode;
}

/** Class of a leaf row in the sidebar, under a tag or a parent page. */
export const sidebarLeafClass = tw(
  'focus-inset h-8 w-full gap-2 pl-5 text-left font-normal text-sm opacity-70 hover:bg-accent/50 data-[active=true]:font-medium data-[active=true]:opacity-100',
);

/** Sidebar row for a section of an API reference page: scrolls to it and closes the mobile sidebar sheet. */
export function SidebarHashItem({ to, hash, isActive, className, children }: SidebarHashItemProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(sidebarLeafClass, className)}
      render={
        <Link
          to={to}
          hash={hash}
          replace
          draggable={false}
          data-active={isActive}
          onClick={(e) => {
            if (isModifiedClick(e)) return;
            e.preventDefault();
            scrollToSectionById(hash);
            sheeter.getState().remove(docsSidebarSheetId);
          }}
        />
      }
    >
      {children}
    </Button>
  );
}
