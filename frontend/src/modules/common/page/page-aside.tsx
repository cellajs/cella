import { Link, useNavigate } from '@tanstack/react-router';
import type { LucideProps } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  className?: string;
  tabs: T[] | readonly T[];
}

export const PageAside = <T extends PageTab>({ tabs, className }: PageAsideProps<T>) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const sectionIds = tabs.map((tab) => tab.id);
  const { currentSection } = useScrollSpy({ sectionIds });

  const handleClick = (id: string) => {
    // Remove hash temporarily to make sure it navigates to section that was already in URL
    navigate({ to: '.', hash: 'top', replace: true });

    // TODO fix while Link component doesn't support hash scroll into view
    const anchor = document.getElementById(id);
    anchor?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    setTimeout(() => {
      navigate({ to: '.', hash: id, replace: true });
    }, 20);
  };

  return (
    <div className={cn('w-full flex flex-col gap-1', className)}>
      {tabs.map(({ id, label, icon, resource }) => {
        const btnClass = `${id.includes('delete') && 'text-red-600'} hover:bg-accent/50 w-full justify-start text-left`;
        const Icon = icon;
        return (
          <Link
            key={id}
            to="."
            className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), btnClass, currentSection === id && 'bg-secondary')}
            hash={id}
            onClick={(e) => {
              // if (window.location.hash !== `#${id}`) return;
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
