import { Trans, useTranslation } from 'react-i18next';
import { EntityBuckets } from '~/modules/marketing/about/entity-buckets';
import { AboutSection } from '~/modules/marketing/about/section';
import { SyncDiagram } from '~/modules/marketing/about/sync-diagram';
import { InfoGrid } from '~/modules/marketing/info-grid';
import { MarketingLayout } from '~/modules/marketing/layout';
import { syncCategoryIcons, syncPageItems } from '~/modules/marketing/marketing-config';

/**
 * Dedicated sync engine page explaining Cella's selective-sync approach and how it works.
 */
export function SyncEnginePage() {
  const { t } = useTranslation();

  return (
    <MarketingLayout>
      <AboutSection
        title="about:selective_sync.title"
        text="about:selective_sync.text"
        textComponents={{ em: <em className="italic" /> }}
      >
        <p className="mx-auto mb-6 max-w-3xl text-foreground leading-normal sm:text-lg sm:leading-7">
          <Trans
            t={t}
            i18nKey="about:cella_approach_intro"
            components={{
              strong: <strong className="font-semibold text-foreground" />,
            }}
          />
        </p>

        <p className="mx-auto mb-6 max-w-3xl text-foreground leading-normal sm:text-lg sm:leading-7">
          <Trans
            t={t}
            i18nKey="about:cella_approach"
            components={{
              strong: <strong className="font-semibold text-foreground" />,
            }}
          />
        </p>

        <p className="mx-auto mb-2 max-w-3xl font-semibold text-foreground leading-normal sm:text-center sm:text-lg sm:leading-7">
          <Trans t={t} i18nKey="about:cella_approach_point_1" />
        </p>
        <p className="mx-auto mb-2 max-w-3xl font-semibold text-foreground leading-normal sm:text-center sm:text-lg sm:leading-7">
          <Trans t={t} i18nKey="about:cella_approach_point_2" />
        </p>
        <p className="mx-auto mb-8 max-w-3xl font-semibold text-foreground leading-normal sm:text-center sm:text-lg sm:leading-7">
          <Trans t={t} i18nKey="about:cella_approach_point_3" />
        </p>

        <EntityBuckets />
      </AboutSection>

      <AboutSection title="about:how.title" text="about:how.text" alternate>
        <p className="mx-auto -mt-8 mb-2 max-w-3xl font-semibold text-foreground leading-normal sm:text-center sm:text-lg sm:leading-7">
          {t('about:how.concept_1')}
        </p>
        <p className="mx-auto mb-12 max-w-3xl font-semibold text-foreground leading-normal sm:text-center sm:text-lg sm:leading-7">
          {t('about:how.concept_2')}
        </p>
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
