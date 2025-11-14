import { useNavigate, useSearch } from '@tanstack/react-router';
import { appConfig } from 'config';
import { useTranslation } from 'react-i18next';
import { SimpleHeader } from '~/modules/common/simple-header';
import MarketingLayout from '~/modules/marketing/layout';
import { LegalSubject, legalConfig } from '~/modules/marketing/legal/legal-config';
import LegalText from '~/modules/marketing/legal/legal-text';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/modules/ui/tabs';
import { objectEntries } from '~/utils/object';

/**
 * Legal page showing core legal texts (privacy policy, terms of use) in tabs.
 */
export const LegalPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Get core legal subjects for tabs
  const legalSubjects = objectEntries(legalConfig).map(([subject]) => subject);

  const tabs = legalSubjects.map((subject) => ({
    id: subject,
    label: legalConfig[subject].label,
  }));

  const { tab } = useSearch({ from: '/legal' });
  const currentTab = tab ?? legalSubjects[0];

  const handleTabChange = (newTab: string) => {
    navigate({
      to: '/legal',
      search: (prev) => ({ ...prev, tab: newTab as LegalSubject }),
    });
  };

  return (
    <MarketingLayout title={t('common:legal')}>
      <div className="text-center my-8">
        <SimpleHeader className="p-3" text={t('common:legal_text', { appName: appConfig.name })} />
      </div>

      <Tabs value={currentTab} onValueChange={handleTabChange} className="mx-auto md:w-[70%] flex flex-col gap-8">
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
                <LegalText subject={id} />
              </div>
            </section>
          </TabsContent>
        ))}
      </Tabs>
    </MarketingLayout>
  );
};
