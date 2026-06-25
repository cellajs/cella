import { Trans, useTranslation } from 'react-i18next';
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
      <div className="my-12">
        <AboutSection
          title="about:selective_sync.title"
          text="about:selective_sync.text"
          textComponents={{ em: <em className="italic" /> }}
        >
          <p className="mx-auto mb-6 max-w-3xl text-muted-foreground leading-normal sm:text-lg sm:leading-7">
            {t('about:cella_approach_intro')}
          </p>

          <p className="mx-auto mb-6 max-w-3xl text-muted-foreground leading-normal sm:text-lg sm:leading-7">
            <Trans
              t={t}
              i18nKey="about:cella_approach"
              components={{
                strong: <strong className="font-semibold text-foreground" />,
              }}
            />
          </p>

          <ul className="mx-auto mb-12 max-w-3xl space-y-2 pl-4 font-semibold text-muted-foreground marker:text-foreground sm:list-disc sm:pl-12 sm:text-lg sm:leading-6">
            <li>
              <Trans
                t={t}
                i18nKey="about:cella_approach_point_1"
                components={{
                  strong: <strong className="font-semibold text-foreground" />,
                }}
              />
            </li>
            <li>
              <Trans t={t} i18nKey="about:cella_approach_point_2" />
            </li>
            <li>
              <Trans t={t} i18nKey="about:cella_approach_point_3" />
            </li>
          </ul>
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
      </div>
    </MarketingLayout>
  );
}
