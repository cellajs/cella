import { Link } from '@tanstack/react-router';
import type { LucideProps } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { buttonVariants } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface Tab {
  id: string;
  label: string;
  resource?: string;
  icon?: React.ElementType<LucideProps>;
}

interface PageAsideProps<T> {
  className?: string;
  tabs: T[] | readonly T[];
}

export const PageAside = <T extends Tab>({ tabs, className }: PageAsideProps<T>) => {
  const { t } = useTranslation();
  const sectionIds = tabs.map((tab) => tab.id);
  const { currentSection } = useScrollSpy({ sectionIds });

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
            replace
          >
            {Icon && <Icon className="mr-2 w-5 h-5" />} {t(label, { resource: t(resource || '').toLowerCase() })}
          </Link>
        );
      })}
    </div>
  );
};
