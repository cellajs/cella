import { Link, useRouterState } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSetHashOnScroll } from '~/hooks/use-set-hash-on-scroll';
import { cn } from '~/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '~/modules/ui/tabs';

interface AsideTabProps {
  className?: string;
  tabs: {
    value: string;
    label: string;
    hash?: string;
  }[];
}

export const AsideTab = ({ tabs, className }: AsideTabProps) => {
  const { location } = useRouterState();
  const [activeTab, setActiveTab] = useState(tabs.find((tab) => tab.hash === location.hash.toLowerCase()) || tabs[0]);
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
    <Tabs value={activeTab.value} className={cn('w-full', className)} orientation="vertical">
      <TabsList variant="side">
        {tabs.map(({ value, label, hash }) => (
          <TabsTrigger key={value} value={value} className="justify-start" variant="secondary" asChild>
            <Link className="flex-1" hash={hash} onClick={() => setActiveTab({ value, label, hash })}>
              {t(label)}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};
