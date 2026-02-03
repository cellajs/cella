import { useParams } from '@tanstack/react-router';
import { appConfig } from 'config';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreloadLazyComponents } from '~/hooks/use-preload-lazy-components';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { SimpleHeader } from '~/modules/common/simple-header';
import StickyBox from '~/modules/common/sticky-box';
import { LegalAside } from '~/modules/marketing/legal/legal-aside';
import { type LegalSubject, legalConfig } from '~/modules/marketing/legal/legal-config';
import { objectEntries } from '~/utils/object';

export interface LegalSubjectConfig {
  id: LegalSubject;
  label: string;
}

/**
 * Legal content component.
 */
export const LegalContent = () => {
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

  const { subject: currentSubject } = useParams({ from: '/legal/$subject' });

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
    <div className="container md:flex md:flex-row my-4 md:mt-8 gap-4">
      <div className="mx-auto md:min-w-48 md:w-[25%] md:mt-3">
        <StickyBox className="z-10 group" offsetTop={12}>
          <SimpleHeader className="p-3" text={t('common:legal_text', { appName: appConfig.name })} collapseText />
          <LegalAside subjects={subjects} currentSubject={currentSubject} className="py-2" />
        </StickyBox>
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
                <Component />
              </div>
            )
          );
        })}
      </div>
    </div>
  );
};
