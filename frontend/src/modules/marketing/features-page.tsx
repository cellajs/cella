import { AboutSection } from '~/modules/marketing/about/section';
import { InfoGrid } from '~/modules/marketing/info-grid';
import { MarketingLayout } from '~/modules/marketing/layout';
import { featureCategoryIcons, featuresPageItems } from '~/modules/marketing/marketing-config';

export function FeaturesPage() {
  return (
    <MarketingLayout>
      <AboutSection title="c:features">
        <div className="mx-auto max-w-5xl md:px-8">
          <InfoGrid items={featuresPageItems} categoryIcons={featureCategoryIcons} />
        </div>
      </AboutSection>
    </MarketingLayout>
  );
}
