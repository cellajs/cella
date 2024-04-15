import { useTranslation } from 'react-i18next';
import { useThemeStore } from '~/store/theme';

import { ExpandableList } from '~/modules/common/expandable-list';
import { useBreakpoints } from '../../../hooks/use-breakpoints';

type FeatureProps = {
  icon: string;
  invertClass: string;
  index: number;
};
const features = [
  { icon: 'hono' },
  { icon: 'react' },
  { icon: 'drizzle' },
  { icon: 'tailwind' },
  { icon: 'lucia' },
  { icon: 'openapi' },
  { icon: 'vite' },
  { icon: 'tanstack' },
  { icon: 'plus' },
];

const Feature = ({ icon, invertClass, index }: FeatureProps) => {
  const { t } = useTranslation();
  const title = `about:feature.title_${index + 1}`;
  const text = `about:feature.text_${index + 1}`;

  return (
    <div className="bg-card relative overflow-hidden rounded-lg p-2">
      <div className="flex h-[180px] flex-col justify-between rounded-md p-6">
        <img src={`/static/features/${icon}.svg`} alt={title} className={`h-12 w-12 object-contain ${invertClass}`} loading="lazy" />
        <div className="space-y-2">
          <h3 className="font-medium">{t(title)}</h3>
          <p className="text-muted-foreground text-sm">{t(text)}</p>
        </div>
      </div>
    </div>
  );
};

const Features = () => {
  const { mode } = useThemeStore();
  const invertClass = mode === 'dark' ? 'invert' : '';
  const isMediumScreen = useBreakpoints('min', 'md');

  return (
    <div className="mx-auto grid max-w-[64rem] justify-center gap-4 sm:grid-cols-2 md:grid-cols-3">
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
