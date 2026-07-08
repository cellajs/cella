import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { nanoid } from 'shared/utils/nanoid';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useCurrentSection } from '~/hooks/use-scroll-spy';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import type { DocHeading } from '~/modules/page/content';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface TocAsideProps {
  headings: DocHeading[];
  className?: string;
}

/**
 * "On this page" navigation for a docs page: the page's h2/h3 headings with a
 * cursor bar that follows the scroll position (spy store). Section registration
 * happens next to the content (view-page.tsx), not here. The body is lazy and
 * the spy observer only picks up elements that exist at registration time.
 */
export const TocAside = ({ headings, className }: TocAsideProps) => {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm', false);
  const [layoutId] = useState(() => nanoid());
  const currentSection = useCurrentSection();

  return (
    <nav className={cn('flex w-full flex-col', className)} aria-label={t('c:docs.on_this_page')}>
      <span className="px-3 pb-2 font-medium text-muted-foreground text-sm lowercase">{t('c:docs.on_this_page')}</span>
      <div className="relative flex flex-col">
        {headings.map(({ id, text, depth }) => {
          const isActive = currentSection === id;
          return (
            <div key={id} className="group/toc relative" data-spy-link={id} data-active={isActive}>
              {isActive &&
                (isMobile ? (
                  <span className="absolute top-2 bottom-2 left-2 ml-px w-[0.20rem] rounded-full bg-primary" />
                ) : (
                  <motion.span
                    layoutId={layoutId}
                    transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }}
                    className="absolute top-2 bottom-2 left-2 ml-px w-[0.20rem] rounded-full bg-primary"
                  />
                ))}
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'group h-8 w-full justify-start gap-2 text-left font-normal text-sm opacity-75 hover:bg-accent/50',
                  'group-data-[spy-active]/toc:opacity-100',
                  depth >= 3 ? 'pl-8' : 'pl-5',
                )}
                render={
                  <Link
                    to="."
                    hash={id}
                    replace
                    draggable={false}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey) return;
                      e.preventDefault();
                      scrollToSectionById(id);
                    }}
                  />
                }
              >
                <span className="truncate text-sm">{text}</span>
              </Button>
            </div>
          );
        })}
      </div>
    </nav>
  );
};
