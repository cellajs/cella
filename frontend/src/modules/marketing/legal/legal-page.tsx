import { useLocation, useNavigate } from '@tanstack/react-router';
import { appConfig } from 'config';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SimpleHeader } from '~/modules/common/simple-header';
import MarketingLayout from '~/modules/marketing/layout';
import { coreSubjects, subjectLabels } from '~/modules/marketing/legal/legal-config';
import LegalText from '~/modules/marketing/legal/legal-text';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/modules/ui/tabs';

export const LegalPage = () => {
  const { t } = useTranslation();

  const slugs = [...coreSubjects, ...appConfig.legal.pages];
  const tabs = slugs.map((slug) => ({
    id: slug,
    label: subjectLabels[slug],
  }));

  const location = useLocation();
  const defaultTab = (slugs as string[]).includes(location.hash) ? location.hash : 'terms';

  const navigate = useNavigate();

  const [currentTab, setCurrentTab] = useState(defaultTab);
  useEffect(() => {
    const hash = location.hash;
    if ((slugs as string[]).includes(hash) && hash !== currentTab) {
      setCurrentTab(hash);
    }
  }, [location.hash]);

  return (
    <MarketingLayout title={t('common:legal')}>
      <div className="text-center my-8">
        <SimpleHeader className="p-3" text={t('common:legal_text', { appName: appConfig.name })} />
      </div>
      <Tabs
        value={currentTab}
        onValueChange={(hash) => navigate({ to: '.', hash, replace: true })}
        className="mx-auto md:w-[70%] flex flex-col gap-8"
      >
        <TabsList className="md:w-[50%] mx-auto">
          {tabs.map(({ id, label }) => (
            <TabsTrigger key={id} value={id}>
              {t(label)}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map(({ id }) => (
          <TabsContent key={id} value={id} className="mb-40">
            <section className="bg-background">
              <div className="mx-auto max-w-3xl pt-8 font-light px-4 md:px-8 min-h-screen">
                <LegalText key={id} subject={id} />
              </div>
            </section>
          </TabsContent>
        ))}
      </Tabs>
    </MarketingLayout>
  );
};
