import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface SidebarHashItemProps {
  to: '/docs/operations' | '/docs/schemas';
  hash: string;
  isActive: boolean;
  className?: string;
  children: ReactNode;
}

/** Sidebar row for a section of an API reference page: scrolls to it and closes the mobile sidebar sheet. */
export function SidebarHashItem({ to, hash, isActive, className, children }: SidebarHashItemProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('h-8 w-full gap-2 pl-5 text-left font-normal text-sm opacity-70 hover:bg-accent/50', 'data-[active=true]:opacity-100', className)}
      render={
        <Link
          to={to}
          hash={hash}
          replace
          draggable={false}
          data-active={isActive}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) return;
            e.preventDefault();
            scrollToSectionById(hash);
            useSheeter.getState().remove('docs-sidebar');
          }}
        />
      }
    >
      {children}
    </Button>
  );
}
