import { Link, useNavigate } from '@tanstack/react-router';
import type { LucideProps } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
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

export const PageAside = <T extends PageTab>({ tabs, className, setFocus }: PageAsideProps<T>) => {
  const isMobile = useBreakpoints('max', 'sm', false);
  const { t } = useTranslation();
  const navigate = useNavigate();

  const sectionIds = tabs.map((tab) => tab.id);
  const { currentSection } = useScrollSpy({ sectionIds });
  const firstTabRef = useRef<HTMLAnchorElement>(null);

  // Focus the first tab on mount
  useEffect(() => {
    if (!isMobile && setFocus) firstTabRef.current?.focus();
  }, []);

  const handleClick = (id: string) => {
    // Remove hash to make sure it navigates to section that was already in URL
    navigate({ to: '.', hash: 'top', replace: true });

    setTimeout(() => {
      navigate({ to: '.', hash: id, replace: true });
    }, 20);
  };

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
            className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), btnClass, currentSection === id && 'bg-secondary')}
            hash={id}
            draggable="false"
            onClick={(e) => {
              if (window.location.hash !== `#${id}`) return;
              e.preventDefault();
              handleClick(id);
            }}
            replace
          >
            {Icon && <Icon className="mr-2 w-5 h-5" />} {t(label, { resource: t(resource || '').toLowerCase() })}
          </Link>
        );
      })}
    </div>
  );
};
