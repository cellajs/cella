import { useTranslation } from 'react-i18next';
import { useUIStore } from '~/store/ui';

import { useBreakpoints } from '~/hooks/use-breakpoints';
import { ExpandableList } from '~/modules/common/expandable-list';
import { features } from '~/modules/marketing/marketing-config';

type FeatureProps = {
  icon: string;
  invertClass: string;
  index: number;
};

const Feature = ({ icon, invertClass, index }: FeatureProps) => {
  const { t } = useTranslation();
  const title = `about:feature.title_${index + 1}`;
  const text = `about:feature.text_${index + 1}`;

  return (
    <div className="bg-card relative overflow-hidden rounded-lg p-2">
      <div className="flex h-44 flex-col justify-between rounded-md p-6 gap-2">
        <img src={`/static/images/features/${icon}.svg`} alt={title} className={`h-8 w-8 object-contain mb-2 ${invertClass}`} loading="lazy" />
        <h3 className="font-medium">{t(title)}</h3>
        <p className="text-muted-foreground text-sm grow">{t(text)}</p>
      </div>
    </div>
  );
};

const Features = () => {
  const mode = useUIStore((state) => state.mode);
  const invertClass = mode === 'dark' ? 'invert' : '';
  const isMediumScreen = useBreakpoints('min', 'md');

  return (
    <div className="mx-auto grid max-w-5xl justify-center gap-4 sm:grid-cols-2 md:grid-cols-3">
      <ExpandableList
        items={features}
        renderItem={(feature, index) => <Feature key={feature.icon} {...feature} index={index} invertClass={invertClass} />}
        initialDisplayCount={4}
        alwaysShowAll={isMediumScreen}
        expandText="common:more_features"
      />
    </div>
  );
};

export default Features;
