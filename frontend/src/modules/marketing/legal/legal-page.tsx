import { useParams } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { usePreloadLazyComponents } from '~/hooks/use-preload-lazy-components';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { type LegalSubject, legalConfig } from '~/modules/auth/legal/legal-config';
import { SimpleHeader } from '~/modules/common/simple-header';
import { MarketingLayout } from '~/modules/marketing/layout';
import { LegalAside } from '~/modules/marketing/legal/legal-aside';
import { objectEntries } from '~/utils/object-entries';

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

  const { subject: currentSubject } = useParams({ from: '/_public/_marketing/legal/$subject' });

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
    <MarketingLayout title={t('c:legal')}>
      <div className="container my-4 gap-4 md:mt-8 md:flex md:flex-row">
        <div className="mx-auto md:mt-3 md:w-[25%] md:min-w-48">
          <div className="group sticky top-3 z-10 max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
            <SimpleHeader className="p-3" text={t('c:legal_text', { appName: appConfig.name })} collapseText />
            <LegalAside subjects={subjects} currentSubject={currentSubject} className="py-2" />
          </div>
        </div>

        {/* Main legal content */}
        <div className="flex min-h-screen flex-col gap-8 md:w-[75%]">
          {subjects.map(({ id }) => {
            const isActive = id === currentSubject;
            const Component = legalConfig[id].component;
            return (
              isActive && (
                <div
                  key={id}
                  className="prose dark:prose-invert mb-40 min-h-screen max-w-full bg-background px-4 pt-4 text-foreground antialiased md:px-8 lg:mx-auto lg:max-w-4xl"
                >
                  <h2 className="pt-8 pb-4 font-bold text-2xl">{t(legalConfig[id].label)}</h2>
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
