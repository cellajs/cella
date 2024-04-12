import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { cn } from '~/lib/utils';
import { buttonVariants } from '../ui/button';
import type { LucideProps } from 'lucide-react';

interface AsideNavProps {
  className?: string;
  tabs: {
    value: string;
    label: string;
    hash?: string;
    icon?: React.ElementType<LucideProps>;
  }[];
}

export const AsideNav = ({ tabs, className }: AsideNavProps) => {
  const { t } = useTranslation();

  const sectionIds = tabs.map((tab) => tab.value);

  const { activeHash } = useScrollSpy({ sectionIds, autoUpdateHash: true });

  // console.log(activeHash, 'TEST')
  // TODO: perhaps move this somehow to useScrollSpy and add a stop when section is already in view
  // TODO2: add option to silently update the hash without scrolling on initial mount with sectionIds[0] (if no hash is present)
  // If the hash already matches but the user is not at the section, clear and re-set the hash
  const handleMismatch = (e: React.MouseEvent<'a', MouseEvent>, target: string) => {
    e.preventDefault();
    const element = document.getElementById(target);
    if (!element) return;
    element.scrollIntoView();
  };

  return (
    <div className={cn('w-full flex flex-col gap-1', className)}>
      {tabs.map(({ value, label, hash, icon }) => {
        const btnClass = `${value.includes('delete') && 'text-red-600'} hover:bg-accent/50 w-full justify-start text-left`;
        const Icon = icon;
        return (
          <Link
            key={value}
            className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), btnClass, activeHash === value && 'bg-secondary')}
            hash={hash}
            replace
            onClick={(e) => handleMismatch(e, value)}
            activeOptions={{ exact: true, includeHash: true }}
            activeProps={{ className: 'bg-secondary' }}
          >
            {Icon && <Icon className="mr-2 w-5 h-5" />} {t(label)}
          </Link>
        );
      })}
    </div>
  );
};
