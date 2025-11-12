import { appConfig } from 'config';
import { lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import { PageAside } from '~/modules/common/page/aside';
import { SimpleHeader } from '~/modules/common/simple-header';
import StickyBox from '~/modules/common/sticky-box';
import MarketingLayout from '~/modules/marketing/layout';
import { defaultSubjects, subjectLabels } from '~/modules/marketing/legal-config';

const LegalText = lazy(() => import('~/modules/marketing/legal-text'));

export const LegalPage = () => {
  const { t } = useTranslation();

  const tabs = [...defaultSubjects, ...appConfig.legal.pages].map((slug) => ({
    id: slug,
    label: subjectLabels[slug],
  }));

  return (
    <MarketingLayout title={t('common:legal')}>
      <div className="container md:flex md:flex-row mt-4 md:mt-8 mx-auto gap-4">
        <div className="mx-auto md:min-w-48 md:w-[30%] md:mt-3">
          <StickyBox className="z-10 max-md:block!" offsetTop={12}>
            <SimpleHeader className="p-3" text={t('common:legal_text', { appName: appConfig.name })} />
            <PageAside tabs={tabs} className="py-2" setFocus />
          </StickyBox>
        </div>
        <div className="md:w-[70%] flex flex-col gap-8">
          {tabs.map(({ id: subject }) => (
            <AsideAnchor key={subject} id={subject} className="mb-40">
              <section className="bg-background">
                <div className="mx-auto max-w-3xl pt-8 font-light px-4 md:px-8 min-h-screen">
                  <LegalText key={subject} subject={subject} />
                </div>
              </section>
            </AsideAnchor>
          ))}
        </div>
      </div>
    </MarketingLayout>
  );
};
