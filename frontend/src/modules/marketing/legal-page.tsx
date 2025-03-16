import { config } from 'config';
import { lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import { PageAside } from '~/modules/common/page/page-aside';
import { SimpleHeader } from '~/modules/common/simple-header';
import StickyBox from '~/modules/common/sticky-box';
import MarketingLayout from '~/modules/marketing/layout';

const LegalTexts = lazy(() => import('~/modules/marketing/legal-texts'));

export type LegalTypes = 'privacy' | 'terms';

const LegalSection = ({ type }: { type: LegalTypes }) => {
  return (
    <section className="bg-background">
      <div className="mx-auto max-w-[48rem] pt-8 font-light px-4 md:px-8 min-h-screen">
        <LegalTexts textFor={type} />
      </div>
    </section>
  );
};

const tabs = [
  { id: 'terms', label: 'common:terms_of_use' },
  { id: 'privacy', label: 'common:privacy_policy' },
] as const;

export const LegalPage = () => {
  const { t } = useTranslation();
  return (
    <MarketingLayout title={t('common:legal')}>
      <div className="container md:flex md:flex-row mt-4 md:mt-8 mx-auto gap-4">
        <div className="mx-auto md:min-w-48 md:w-[30%] md:mt-3">
          <StickyBox className="z-10 max-md:block!">
            <SimpleHeader className="p-3" text={t('common:legal_text', { appName: config.name })} />
            <PageAside tabs={tabs} className="py-2" />
          </StickyBox>
        </div>
        <div className="md:w-[70%] flex flex-col gap-8">
          {tabs.map((tab) => {
            return (
              <AsideAnchor key={tab.id} id={tab.id} className="mb-40">
                <LegalSection type={tab.id} />
              </AsideAnchor>
            );
          })}
        </div>
      </div>
    </MarketingLayout>
  );
};
