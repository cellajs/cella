import { useParams } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { usePreloadLazyComponents } from '~/hooks/use-preload-lazy-components';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { SimpleHeader } from '~/modules/common/simple-header';
import { MarketingLayout } from '~/modules/marketing/layout';
import { LegalAside } from '~/modules/marketing/legal/legal-aside';
import { type LegalSubject, legalConfig } from '~/modules/marketing/legal/legal-config';
import { objectEntries } from '~/utils/object';

/**
 * Legal page showing core legal texts (privacy policy, terms of use) with sidebar navigation.
 */
export function LegalPage() {
  const { t } = useTranslation();

  const subjects = useMemo(
    () =>
      objectEntries(legalConfig).map(([subject]) => ({
        id: subject,
        label: legalConfig[subject].label,
        sections: legalConfig[subject].sections,
      })),
    [],
  );

  const { subject: currentSubject } = useParams({ from: '/publicLayout/legal/$subject' });

  // Get section IDs for the current subject
  const sectionIds = useMemo(
    () => legalConfig[currentSubject as LegalSubject]?.sections.map((s: { id: string }) => s.id) || [],
    [currentSubject],
  );

  // Enable scroll spy near the content - uses useLocation for hash in aside
  useScrollSpy(sectionIds);

  // Preload all lazy components on mount for instant switching
  const lazyComponents = useMemo(() => subjects.map(({ id }) => legalConfig[id].component), [subjects]);
  usePreloadLazyComponents(lazyComponents);

  return (
    <MarketingLayout title={t('common:legal')}>
      <div className="container md:flex md:flex-row my-4 md:mt-8 gap-4">
        <div className="mx-auto md:min-w-48 md:w-[25%] md:mt-3">
          <div className="sticky top-3 z-10 group">
            <SimpleHeader className="p-3" text={t('common:legal_text', { appName: appConfig.name })} collapseText />
            <LegalAside subjects={subjects} currentSubject={currentSubject} className="py-2" />
          </div>
        </div>

        {/* Main legal content */}
        <div className="md:w-[75%] flex flex-col gap-8 min-h-screen">
          {subjects.map(({ id }) => {
            const isActive = id === currentSubject;
            const Component = legalConfig[id].component;
            return (
              isActive && (
                <div
                  key={id}
                  className="mx-auto max-w-full lg:max-w-3xl pt-4 antialiased px-4 md:px-8 bg-background min-h-screen mb-40"
                >
                  <h2 className="text-2xl font-bold pt-8 pb-4">{t(legalConfig[id].label)}</h2>
                  <Component />
                </div>
              )
            );
          })}
        </div>
      </div>
    </MarketingLayout>
  );
}
