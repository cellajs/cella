import { appConfig } from 'config';
import { lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { SimpleHeader } from '~/modules/common/simple-header';
import MarketingLayout from '~/modules/marketing/layout';
import { defaultSubjects, subjectLabels } from '~/modules/marketing/legal-config';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/modules/ui/tabs';

const LegalText = lazy(() => import('~/modules/marketing/legal-text'));

export const LegalPage = () => {
  const { t } = useTranslation();

  const tabs = [...defaultSubjects, ...appConfig.legal.pages].map((slug) => ({
    id: slug,
    label: subjectLabels[slug],
  }));

  return (
    <MarketingLayout title={t('common:legal')}>
      <div className="text-center my-8">
        <SimpleHeader className="p-3" text={t('common:legal_text', { appName: appConfig.name })} />
      </div>
      <Tabs defaultValue="terms" className="mx-auto md:w-[70%] flex flex-col gap-8">
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
