import { Link } from '@tanstack/react-router';
import type { LucideProps } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { buttonVariants } from '~/modules/ui/button';
import { cn } from '~/utils/utils';

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
  const { activeHash } = useScrollSpy({ sectionIds, autoUpdateHash: true });

  // console.log(activeHash, 'TEST')
  // TODO: perhaps move this somehow to useScrollSpy and add a stop when section is already in view
  // TODO2: add option to silently update the hash without scrolling on initial mount with sectionIds[0] (if no hash is present)
  // If the hash already matches but the user is not at the section, clear and re-set the hash
  const handleMismatch = (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>, target: string) => {
    e.preventDefault();
    const element = document.getElementById(`${target}-anchor`);
    if (!element) return;
    element.scrollIntoView();
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
            className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), btnClass, activeHash === id && 'bg-secondary')}
            hash={id}
            replace
            onClick={(e) => handleMismatch(e, id)}
            activeOptions={{ exact: true, includeHash: true }}
            activeProps={{ className: 'bg-secondary' }}
          >
            {Icon && <Icon className="mr-2 w-5 h-5" />} {t(label, { resource: t(resource || '').toLowerCase() })}
          </Link>
        );
      })}
    </div>
  );
};
