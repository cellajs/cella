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

interface PageTab extends PlacementDescriptor {
  icon?: IconComponent;
}

interface PageAsideProps<T> {
  tabs: T[] | readonly T[];
  className?: string;
  setFocus?: boolean;
}

export function PageAside<T extends PageTab>({ tabs, className, setFocus }: PageAsideProps<T>) {
  const isMobile = useBreakpointBelow('sm', false);
  const { t } = useTranslation();

  const sectionIds = tabs.map((tab) => tab.id);
  useScrollSpy(sectionIds);

  const firstTabRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!isMobile && setFocus) firstTabRef.current?.focus();
  }, []);

  return (
    <div className={cn('flex w-full flex-col gap-1', className)}>
      {tabs.map(({ id, label, icon, resource }, index) => {
        // The ghost hover swaps the text color, so a destructive row restates its own
        const btnClass = cn(id.includes('delete') && 'text-destructive hover:text-destructive', 'w-full justify-start text-left hover:bg-accent/50');
        const Icon = icon;
        return (
          <Button
            key={id}
            variant="ghost"
            size="lg"
            data-spy-link={id}
            className={cn(
              btnClass,
              // Rows at rest sit back like the page tabs; hover, focus and the active row come forward
              'opacity-70 transition-[color,background-color,opacity] hover:opacity-100 focus-visible:opacity-100 data-spy-active:opacity-100',
              'more-contrast:opacity-100',
              // Fill and weight carry the active row; the ring is an edge only a reader who asked for contrast needs
              'data-spy-active:bg-secondary data-spy-active:font-semibold',
              'more-contrast:data-spy-active:inset-ring more-contrast:data-spy-active:inset-ring-input',
            )}
            render={
              <Link
                ref={index === 0 ? firstTabRef : undefined}
                to="."
                hash={id}
                // Every link points at this page: without the hash, each would announce itself as the current page.
                activeOptions={{ includeHash: true }}
                draggable={false}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) return;
                  e.preventDefault();
                  scrollToSectionById(id);
                }}
                replace
              />
            }
          >
            {Icon && <Icon className="size-5" />} {t(label, { resource: resource ? t(resource).toLowerCase() : '' })}
          </Button>
        );
      })}
    </div>
  );
}
