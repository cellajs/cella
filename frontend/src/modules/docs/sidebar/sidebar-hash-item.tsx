import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { docsSidebarSheetId } from '~/modules/docs/sidebar/docs-sidebar-sheet';
import { Button } from '~/modules/ui/button';
import { isModifiedClick } from '~/utils/is-modified-click';
import { tw } from '~/utils/tw';

interface SidebarHashItemProps {
  to: '/docs/operations' | '/docs/schemas';
  hash: string;
  isActive: boolean;
  children: ReactNode;
}

/** Class of a leaf row in the sidebar, under a tag or a parent page. */
export const sidebarLeafClass = tw(
  'focus-inset h-8 w-full justify-start gap-2 pl-5 text-left font-normal opacity-70 hover:bg-accent/50 data-[active=true]:font-medium data-[active=true]:opacity-100',
);

/** Sidebar row for a section of an API reference page: scrolls to it and closes the mobile sidebar sheet. */
export function SidebarHashItem({ to, hash, isActive, children }: SidebarHashItemProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={sidebarLeafClass}
      render={
        <Link
          to={to}
          hash={hash}
          replace
          draggable={false}
          data-active={isActive}
          onClick={(event) => {
            if (isModifiedClick(event)) return;
            event.preventDefault();
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
