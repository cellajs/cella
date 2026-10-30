import { CheckIcon } from 'lucide-react';
import { Suspense } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useBreakpointAbove } from '~/hooks/use-breakpoints';
import { AboutSection, AboutStatement } from '~/modules/marketing/about/section';
import { SyncDiagram } from '~/modules/marketing/about/sync-diagram';
import { InfoGrid } from '~/modules/marketing/info-grid';
import { MarketingLayout } from '~/modules/marketing/layout';
import { syncCategoryIcons, syncPageItems } from '~/modules/marketing/marketing-config';
import { lazyNamed } from '~/utils/lazy-named';
import { tw } from '~/utils/tw';

const MorphAnimation = lazyNamed(() => import('~/modules/common/morph-animation/morph-animation'), 'MorphAnimation');

const rowClass = tw('flex gap-5 border-t py-4');
// The marker box is one text line tall, so "or" and the icon center on the first line of a wrapped row
const markerClass = tw('flex h-6 w-5 shrink-0 items-center font-mono text-muted-foreground text-sm lowercase sm:h-7');
const rowTextClass = tw('font-medium sm:text-lg');

export function SyncEnginePage() {
  const { t } = useTranslation();
  const isDesktop = useBreakpointAbove('lg');

  return (
    <MarketingLayout title="about:selective_sync.title">
      <AboutSection>
        <AboutStatement text="about:selective_sync.text" className="glow-underline mb-12 leading-relaxed md:mb-20" />

        <p className="mx-auto max-w-measure">
          <Trans
            t={t}
            i18nKey="about:cella_approach_intro"
            components={{
              strong: <strong className="font-semibold" />,
            }}
          />
        </p>
        <p className="mx-auto mt-4 mb-6 max-w-measure">{t('about:cella_approach_fit')}</p>

        {/* Any one point is enough, so the rows after the first start with "or" */}
        <ul className="mx-auto max-w-3xl border-b">
          {([1, 2, 3] as const).map((point) => (
            <li key={point} className={rowClass}>
              <span className={markerClass}>{point > 1 && t('c:or')}</span>
              <span className={rowTextClass}>
                <Trans t={t} i18nKey={`about:cella_approach_point_${point}`} />
              </span>
            </li>
          ))}
        </ul>
      </AboutSection>

      {/* Anchored between the two sections, outside their clipping; the mask hides it up to 1rem past the 48rem content column, so it only fills the side margin */}
      {isDesktop && (
        <div className="relative overflow-x-clip" aria-hidden="true">
          <Suspense fallback={null}>
            <div className="mask-[linear-gradient(to_right,transparent_7rem,black_11rem)] pointer-events-none absolute -top-24 left-[calc(50%+18rem)] size-300 -translate-y-1/2 opacity-30 saturate-300 dark:opacity-25">
              <MorphAnimation still={31} fizz={1} grid={230} stamp="plus" />
            </div>
          </Suspense>
        </div>
      )}

      <AboutSection title="about:how.title" alternate>
        <ul className="mx-auto mb-10 max-w-3xl border-b">
          {(['about:how.concept_1', 'about:how.concept_2'] as const).map((key) => (
            <li key={key} className={rowClass}>
              <span className={markerClass}>
                <CheckIcon className="size-4" />
              </span>
              <span className={rowTextClass}>{t(key)}</span>
            </li>
          ))}
        </ul>
        <SyncDiagram />
      </AboutSection>

      <AboutSection title="about:features.category_sync">
        <div className="mx-auto max-w-5xl md:px-8">
          <InfoGrid items={syncPageItems} categoryIcons={syncCategoryIcons} />
        </div>
      </AboutSection>
    </MarketingLayout>
  );
}
