import { Link, useLocation } from '@tanstack/react-router';
import type { LucideProps } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { buttonVariants } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface PageTab {
  id: string;
  label: string;
  resource?: string;
  icon?: React.ElementType<LucideProps>;
}

interface PageAsideProps<T> {
  tabs: T[] | readonly T[];
  className?: string;
  setFocus?: boolean;
}

/**
 * Page Aside Component which renders a list of tabs/links for navigation within a page.
 * @param tabs (PageTab[]) - An array of tab objects containing id, label, resource, and optional icon.
 * @param className - Optional additional class names for styling.
 * @param setFocus - Optional boolean to set focus on the first tab on mount.
 */
export const PageAside = <T extends PageTab>({ tabs, className, setFocus }: PageAsideProps<T>) => {
  const isMobile = useBreakpoints('max', 'sm', false);
  const { t } = useTranslation();

  const sectionIds = tabs.map((tab) => tab.id);
  useScrollSpy(sectionIds);

  // Get current section from URL hash
  const { hash } = useLocation();
  const currentSection = hash || sectionIds[0];

  const firstTabRef = useRef<HTMLAnchorElement>(null);

  // Focus the first tab on mount
  useEffect(() => {
    if (!isMobile && setFocus) firstTabRef.current?.focus();
  }, []);

  return (
    <div className={cn('w-full flex flex-col gap-1', className)}>
      {tabs.map(({ id, label, icon, resource }, index) => {
        const btnClass = `${id.includes('delete') && 'text-red-600'} hover:bg-accent/50 w-full justify-start text-left`;
        const Icon = icon;
        return (
          <Link
            key={id}
            ref={index === 0 ? firstTabRef : undefined}
            to="."
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'lg' }),
              btnClass,
              currentSection === id && 'bg-secondary',
            )}
            hash={id}
            draggable="false"
            onClick={(e) => {
              e.preventDefault();
              scrollToSectionById(id);
            }}
            replace
          >
            {Icon && <Icon className="mr-2 size-5" />} {t(label, { resource: t(resource || '').toLowerCase() })}
          </Link>
        );
      })}
    </div>
  );
};
