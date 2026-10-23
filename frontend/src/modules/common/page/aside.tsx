import { Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import type { PlacementDescriptor } from '~/lib/placements';
import type { IconComponent } from '~/modules/common/icons/types';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface PageAsideItem extends PlacementDescriptor {
  icon?: IconComponent;
}

interface PageAsideProps<T> {
  tabs: readonly T[];
  className?: string;
  /** Focuses the first row on mount, from sm up. */
  autoFocus?: boolean;
}

export function PageAside<T extends PageAsideItem>({ tabs, className, autoFocus }: PageAsideProps<T>) {
  const isMobile = useBreakpointBelow('sm', false);
  const { t } = useTranslation();

  const sectionIds = tabs.map((tab) => tab.id);
  useScrollSpy(sectionIds);

  const firstTabRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!isMobile && autoFocus) firstTabRef.current?.focus();
  }, []);

  return (
    <div className={cn('flex w-full flex-col gap-1', className)}>
      {tabs.map(({ id, label, icon: Icon, resource }, index) => {
        const destructive = id.includes('delete');
        return (
          <Button
            key={id}
            variant="ghost"
            size="lg"
            data-spy-link={id}
            className={cn(
              'w-full justify-start hover:bg-accent/50',
              // The ghost hover swaps the text color, so a destructive row restates its own
              destructive && 'text-destructive hover:text-destructive',
              // Rows at rest sit back like the page tabs; hover, focus and the active row come forward. Dimmed, destructive text drops below 4.5:1
              !destructive && 'opacity-70',
              'more-contrast:opacity-100 transition-[color,background-color,opacity] hover:opacity-100 focus-visible:opacity-100 data-spy-active:opacity-100',
              // Fill and weight carry the active row; the ring is an edge only a reader who asked for contrast needs
              'more-contrast:data-spy-active:inset-ring more-contrast:data-spy-active:inset-ring-input data-spy-active:bg-secondary data-spy-active:font-semibold',
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
            {t(label, { resource: resource ? t(resource).toLowerCase() : '' })}
          </Button>
        );
      })}
    </div>
  );
}
