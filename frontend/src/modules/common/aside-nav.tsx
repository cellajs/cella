import { Link, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSetHashOnScroll } from '~/hooks/use-set-hash-on-scroll';
import { cn } from '~/lib/utils';
import { buttonVariants } from '../ui/button';

interface AsideNavProps {
  className?: string;
  tabs: {
    value: string;
    label: string;
    hash?: string;
  }[];
}

export const AsideNav = ({ tabs, className }: AsideNavProps) => {
  const { location } = useRouterState();
  const { t } = useTranslation();

  const sectionIds = tabs.map((tab) => tab.value);
  const topSectionId = tabs[0].value;

  useSetHashOnScroll({ sectionIds });

  useEffect(() => {
    const locationHash = location.hash.replace('#', '');
    if (sectionIds.includes(locationHash) && locationHash !== topSectionId) {
      const element = document.getElementById(locationHash);
      if (!element) return;
      element.scrollIntoView();
    }
    document.documentElement.classList.add('scroll-smooth');

    return () => {
      document.documentElement.classList.remove('scroll-smooth');
    };
  }, []);

  return (
    <div className={cn('w-full flex flex-col gap-1', className)}>
      {tabs.map(({ value, label, hash }) => {
        const btnClass = `${value.includes('delete') && 'text-red-600'} hover:bg-accent/50 w-full justify-start text-left`;

        return (
          <Link
            className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), btnClass)}
            hash={hash}
            replace
            activeOptions={{ exact: true, includeHash: true }}
            activeProps={{ className: 'bg-secondary' }}
          >
            {t(label)}
          </Link>
        );
      })}
    </div>
  );
};
