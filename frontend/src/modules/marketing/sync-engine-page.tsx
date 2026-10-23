import { Trans, useTranslation } from 'react-i18next';
import { AboutSection } from '~/modules/marketing/about/section';
import { SyncDiagram } from '~/modules/marketing/about/sync-diagram';
import { InfoGrid } from '~/modules/marketing/info-grid';
import { MarketingLayout } from '~/modules/marketing/layout';
import { syncCategoryIcons, syncPageItems } from '~/modules/marketing/marketing-config';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

const pillClass = tw('mx-auto max-w-3xl rounded-full bg-accent/50 px-4 py-2 text-center text-foreground leading-normal');

/**
 * Dedicated sync engine page explaining Cella's selective-sync approach and how it works.
 */
export function SyncEnginePage() {
  const { t } = useTranslation();

  return (
    <MarketingLayout title="about:selective_sync.title">
      <AboutSection text="about:selective_sync.text" textComponents={{ em: <em className="italic" /> }}>
        <p className="mx-auto mb-6 max-w-3xl text-foreground leading-normal">
          <Trans
            t={t}
            i18nKey="about:cella_approach_intro"
            components={{
              strong: <strong className="font-semibold text-foreground" />,
            }}
          />
        </p>

        <div className="space-y-2">
          {([1, 2, 3] as const).map((point) => (
            <p key={point} className={pillClass}>
              <Trans t={t} i18nKey={`about:cella_approach_point_${point}`} />
            </p>
          ))}
        </div>
      </AboutSection>

      <AboutSection title="about:how.title" text="about:how.text" alternate>
        <p className={cn(pillClass, '-mt-8')}>{t('about:how.concept_1')}</p>
        <p className={cn(pillClass, 'mt-2 mb-10')}>{t('about:how.concept_2')}</p>
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
