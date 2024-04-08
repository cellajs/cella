import { Link, useRouterState } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger } from '~/modules/ui/tabs';

interface AsideTabProps {
  tabs: {
    value: string;
    label: string;
    hash?: string;
  }[];
}

export const AsideTab = ({ tabs }: AsideTabProps) => {
  const { location } = useRouterState();
  const [activeTab, setActiveTab] = useState(tabs.find((tab) => tab.hash === location.hash.toLowerCase())?.value || tabs[0].value);
  const { t } = useTranslation();

  useEffect(() => {
    function handleHashChange() {
      const hash = tabs.find((tab) => tab.hash === location.hash.toLowerCase())?.value || tabs[0].value;
      setActiveTab(hash);
    }
    handleHashChange();
  }, [location.hash]);

  return (
    <Tabs value={activeTab} className="w-full" orientation="vertical">
      <TabsList variant="side">
        {tabs.map(({ value, label, hash }) => (
          <TabsTrigger value={value} className="justify-start" variant="secondary" asChild>
            <Link className="flex-1" hash={hash}>
              {t(label)}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};
