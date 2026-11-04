import { Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { scrollToSectionById } from '~/hooks/scroll-spy-store';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import type { PlacementDescriptor } from '~/lib/placements';
import type { IconComponent } from '~/modules/common/icons/types';
import type { TabLabel } from '~/modules/common/page/tab-nav-shell';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { getHasNavigated } from '~/utils/nav-transition';

type PageAsideItem = Omit<PlacementDescriptor, 'label'> &
  TabLabel & {
    icon?: IconComponent;
    className?: string;
  };

interface PageAsideProps<T> {
  tabs: readonly T[];
  className?: string;
  /** Focuses the first row after a navigation, from sm up. */
  autoFocus?: boolean;
}

export function PageAside<T extends PageAsideItem>({ tabs, className, autoFocus }: PageAsideProps<T>) {
  const isMobile = useBreakpointBelow('sm', false);
  const { t } = useTranslation();

  const sectionIds = tabs.map((tab) => tab.id);
  useScrollSpy(sectionIds);

  const firstTabRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!isMobile && autoFocus && getHasNavigated()) firstTabRef.current?.focus();
  }, []);

  return (
    <div className={cn('flex w-full flex-col gap-1', className)}>
      {tabs.map((tab: PageAsideItem, index) => {
        const { id, icon: Icon, resource, className: tabClassName } = tab;
        const destructive = id.includes('delete');
        return (
          <Button
            key={id}
            variant="ghost"
            size="lg"
            data-spy-link={id}
            className={cn(
              'w-full justify-start',
              // The ghost hover swaps the text color, so a destructive row restates its own
              destructive && 'text-destructive hover:text-destructive',
              !destructive && 'text-muted-foreground focus-visible:text-foreground data-spy-active:text-foreground',
              'transition-[color,background-color]',
              'more-contrast:data-spy-active:inset-ring more-contrast:data-spy-active:inset-ring-input data-spy-active:bg-accent data-spy-active:font-medium',
              tabClassName,
            )}
            render={
              <Link
                ref={index === 0 ? firstTabRef : undefined}
                to="."
                hash={id}
                // Every link points at this page: without the hash, each would announce itself as the current page.
                activeOptions={{ includeHash: true }}
                draggable={false}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey) return;
                  event.preventDefault();
                  scrollToSectionById(id);
                }}
                replace
              />
            }
          >
            {Icon && <Icon className="size-5" />}
            {'text' in tab ? tab.text : t(tab.label, { resource: resource ? t(resource) : '' })}
          </Button>
        );
      })}
    </div>
  );
}
