import { useTranslation } from 'react-i18next';
import { MarketingLayout } from '~/modules/marketing/layout';
import type { FeatureCategory } from '~/modules/marketing/marketing-config';
import { featureCategoryIcons, featuresPageItems } from '~/modules/marketing/marketing-config';

function FeatureTile({ id }: { id: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg bg-card p-6">
      <h3 className="font-medium">{t(`about:features.${id}`)}</h3>
      <p className="mt-2 text-muted-foreground text-sm">{t(`about:features.${id}.text`)}</p>
    </div>
  );
}

export function FeaturesPage() {
  const { t } = useTranslation();

  const categories = featuresPageItems.reduce<FeatureCategory[]>((acc, item) => {
    if (!acc.includes(item.category)) acc.push(item.category);
    return acc;
  }, []);

  return (
    <MarketingLayout title={t('c:features')}>
      <section className="bg-background py-16">
        <div className="mx-auto max-w-5xl space-y-16 px-4 md:px-8">
          {categories.map((category) => {
            const CategoryIcon = featureCategoryIcons[category];
            return (
              <div key={category}>
                <h2 className="mb-6 flex items-center gap-2 pl-6 font-semibold text-xl">
                  <CategoryIcon className="size-5 text-muted-foreground" />
                  {t(`about:features.category_${category}`)}
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {featuresPageItems
                    .filter((item) => item.category === category)
                    .map((item) => (
                      <FeatureTile key={item.id} id={item.id} />
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </MarketingLayout>
  );
}
