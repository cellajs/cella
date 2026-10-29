import { Suspense } from 'react';
import { useBreakpointAbove } from '~/hooks/use-breakpoints';
import { AboutSection } from '~/modules/marketing/about/section';
import { InfoGrid } from '~/modules/marketing/info-grid';
import { MarketingLayout } from '~/modules/marketing/layout';
import { featureCategoryIcons, featuresPageItems } from '~/modules/marketing/marketing-config';
import { lazyNamed } from '~/utils/lazy-named';

const MorphAnimation = lazyNamed(() => import('~/modules/common/morph-animation/morph-animation'), 'MorphAnimation');

export function FeaturesPage() {
  const isDesktop = useBreakpointAbove('lg');

  return (
    <MarketingLayout title="c:features">
      {/* The database mark beside the data modelling group, reaching about 8rem under the opaque tiles. It sits below
          every layer of the page, the hero gradient's -3 included, so the tiles draw over it, and low enough that its
          trailing grains start below the hero's curve, which would cut them in a straight line. The grid keeps the sync
          page's grain size on this larger canvas. */}
      {isDesktop && (
        <div className="relative overflow-x-clip" aria-hidden="true">
          <Suspense fallback={null}>
            <div className="pointer-events-none absolute top-232 right-[calc(50%-12rem)] -z-4 size-600 -translate-y-1/2 opacity-20 saturate-300 dark:opacity-15">
              <MorphAnimation variant="database" still={1464} fizz={1} grid={460} overscan={1.35} stamp="plus" />
            </div>
          </Suspense>
        </div>
      )}

      <AboutSection>
        <div className="mx-auto max-w-5xl md:px-8">
          <InfoGrid items={featuresPageItems} categoryIcons={featureCategoryIcons} />
        </div>
      </AboutSection>
    </MarketingLayout>
  );
}
