import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { scrollToSectionById } from '~/hooks/scroll-spy-store';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import type { operationLinkOptions, schemaLinkOptions } from '~/modules/docs/helpers/reference-links';
import { clearedOperationSearch } from '~/modules/docs/operations/operations-filter';
import { docsSidebarSheetId } from '~/modules/docs/sidebar/docs-sidebar-sheet';
import { Button } from '~/modules/ui/button';
import { isModifiedClick } from '~/utils/is-modified-click';
import { tw } from '~/utils/tw';

interface SidebarHashItemProps {
  link: ReturnType<typeof operationLinkOptions> | ReturnType<typeof schemaLinkOptions>;
  isActive: boolean;
  /** The page's search hides this section: the link clears the search, and the queued scroll finds it once it renders. */
  isHidden?: boolean;
  children: ReactNode;
}

/** Class of a leaf row in the sidebar, under a tag or a parent page: it starts right of the parent's rail, so its fill never covers it. */
export const sidebarLeafClass = tw(
  'focus-inset no-focus-ring:h-9 text-muted-foreground data-[active=true]:text-foreground ml-4 flex h-8 w-auto justify-start gap-2 pl-2 font-normal data-[active=true]:font-medium',
);

/** Sidebar row for a section of an API reference page: scrolls to it and closes the mobile sidebar sheet. */
export function SidebarHashItem({ link, isActive, isHidden, children }: SidebarHashItemProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={sidebarLeafClass}
      render={
        <Link
          {...link}
          search={isHidden ? (prev) => ({ ...prev, ...clearedOperationSearch, ...link.search }) : link.search}
          replace
          resetScroll={false}
          data-active={isActive}
          onClick={(event) => {
            if (isModifiedClick(event)) return;
            if (!isHidden) event.preventDefault();
            scrollToSectionById(link.hash);
            sheeter.getState().remove(docsSidebarSheetId);
          }}
        />
      }
    >
      {children}
    </Button>
  );
}
