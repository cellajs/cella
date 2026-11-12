import { CheckIcon } from 'lucide-react';
import { type ReactNode, Suspense } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useBreakpointAbove } from '~/hooks/use-breakpoints';
import { AboutSection, AboutStatement } from '~/modules/marketing/about/section';
import { SyncDiagram } from '~/modules/marketing/about/sync-diagram';
import { InfoGrid } from '~/modules/marketing/info-grid';
import { MarketingLayout } from '~/modules/marketing/layout';
import { syncCategoryIcons, syncPageItems } from '~/modules/marketing/marketing-config';
import { lazyNamed } from '~/utils/lazy-named';

const MorphAnimation = lazyNamed(() => import('~/modules/common/morph-animation/morph-animation'), 'MorphAnimation');

function PointRow({ marker, children }: { marker: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-5 border-t py-4">
      {/* "Or" and the icon center on the first line of a wrapped row: the box is one text line tall */}
      <span className="text-muted-foreground flex h-6 w-5 shrink-0 items-center font-mono text-sm lowercase sm:h-7">{marker}</span>
      <span className="font-medium sm:text-lg">{children}</span>
    </li>
  );
}

export function SyncEnginePage() {
  const { t } = useTranslation();
  const isDesktop = useBreakpointAbove('lg');

  return (
    <MarketingLayout title="about:selective_sync.title">
      <AboutSection>
        <AboutStatement text="about:selective_sync.text" className="glow-underline mb-12 leading-relaxed md:mb-20" />

        <p className="max-w-measure mx-auto">
          <Trans
            t={t}
            i18nKey="about:cella_approach_intro"
            components={{
              strong: <strong className="font-semibold" />,
            }}
          />
        </p>
        <p className="max-w-measure mx-auto mt-4 mb-6">{t('about:cella_approach_fit')}</p>

        {/* Any one point is enough, so the rows after the first start with "or" */}
        <ul className="mx-auto max-w-3xl border-b">
          {([1, 2, 3] as const).map((point) => (
            <PointRow key={point} marker={point > 1 && t('c:or')}>
              <Trans t={t} i18nKey={`about:cella_approach_point_${point}`} />
            </PointRow>
          ))}
        </ul>
      </AboutSection>

      {/* Anchored between the two sections, outside their clipping; the mask hides it up to 1rem past the 48rem content column, so it only fills the side margin */}
      {isDesktop && (
        <div className="relative overflow-x-clip" aria-hidden="true">
          <Suspense fallback={null}>
            <div className="pointer-events-none absolute -top-24 left-[calc(50%+18rem)] size-300 -translate-y-1/2 mask-[linear-gradient(to_right,transparent_7rem,black_11rem)] opacity-30 saturate-300 dark:opacity-25">
              <MorphAnimation palette="brand" still={31} fizz={1} grid={230} stamp="plus" />
            </div>
          </Suspense>
        </div>
      )}

      <AboutSection title="about:how.title" alternate>
        <ul className="mx-auto mb-10 max-w-3xl border-b">
          {(['about:how.concept_1', 'about:how.concept_2'] as const).map((key) => (
            <PointRow key={key} marker={<CheckIcon className="size-4" />}>
              {t(key)}
            </PointRow>
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
