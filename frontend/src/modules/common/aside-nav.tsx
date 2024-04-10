import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
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
  const { t } = useTranslation();

  const sectionIds = tabs.map((tab) => tab.value);

  useScrollSpy({ sectionIds });

  return (
    <div className={cn('w-full flex flex-col gap-1', className)}>
      {tabs.map(({ value, label, hash }) => {
        const btnClass = `${value.includes('delete') && 'text-red-600'} hover:bg-accent/50 w-full justify-start text-left`;

        return (
          <Link
            key={value}
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
