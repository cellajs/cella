import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { usePreloadLazyComponents } from '~/hooks/use-preload-lazy-components';
import { RegisterSpySections } from '~/hooks/use-scroll-spy';
import { legalConfig } from '~/modules/auth/legal/legal-config';
import { legalOverviewId } from '~/modules/auth/legal/legal-types';
import { SimpleHeader } from '~/modules/common/simple-header';
import { MarketingLayout } from '~/modules/marketing/layout';
import { LegalAside } from '~/modules/marketing/legal/legal-aside';
import { objectEntries } from '~/utils/object-entries';

const subjects = objectEntries(legalConfig).map(([subject, { label, sections }]) => ({ id: subject, label, sections }));

// Preloaded on mount so switching subject renders without a lazy chunk fetch.
const lazyComponents = subjects.map(({ id }) => legalConfig[id].component);

export function LegalPage() {
  const { t } = useTranslation();

  // The route parses the subject, so an unknown one is already the default
  const { subject: currentSubject } = useParams({ from: '/_public/_marketing/legal/$subject' });
  const { component: Component, label, sections } = legalConfig[currentSubject];

  usePreloadLazyComponents(lazyComponents);

  return (
    <MarketingLayout title="c:legal">
      <div className="container my-4 gap-4 md:mt-8 md:flex">
        <div className="mx-auto md:mt-3 md:w-1/4 md:min-w-48">
          <SimpleHeader className="p-3" text="c:legal_text" />
          {/* Only the nav pins: a sticky intro ate the short viewport of a phone, where the aside stacks above the text */}
          <div className="sticky top-3 z-10 max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
            <LegalAside subjects={subjects} currentSubject={currentSubject} className="py-2" />
          </div>
        </div>

        <div className="flex min-h-svh flex-col md:w-3/4">
          <div
            key={currentSubject}
            id={`spy-${legalOverviewId}`}
            className="prose dark:prose-invert mb-40 min-h-svh max-w-full bg-background px-4 pt-4 md:px-8 lg:mx-auto lg:max-w-4xl"
          >
            <h2 className="pt-8 pb-4 font-bold text-2xl">{t(label)}</h2>
            <Component />
            {/* The lazy text suspends inside MarketingLayout; registering here waits for its sections */}
            <RegisterSpySections ids={sections.map((section) => section.id)} />
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
