import { useTranslation } from 'react-i18next';
import { useThemeStore } from '~/store/theme';

import { useBreakpoints } from '~/hooks/use-breakpoints';
import { ExpandableList } from '~/modules/common/expandable-list';

type FeatureProps = {
  icon: string;
  invertClass: string;
  index: number;
};
const features = [
  { icon: 'hono' },
  { icon: 'react' },
  { icon: 'drizzle' },
  { icon: 'shadcn' },
  { icon: 'lucia' },
  { icon: 'openapi' },
  { icon: 'vite' },
  { icon: 'tanstack' },
  { icon: 'electric' },
];

const Feature = ({ icon, invertClass, index }: FeatureProps) => {
  const { t } = useTranslation();
  const title = `about:feature.title_${index + 1}`;
  const text = `about:feature.text_${index + 1}`;

  return (
    <div className="bg-card relative overflow-hidden rounded-lg p-2">
      <div className="flex h-44 flex-col justify-between rounded-md p-6 gap-2">
        <img src={`/static/images/features/${icon}.svg`} alt={title} className={`h-12 w-12 object-contain ${invertClass}`} loading="lazy" />
        <h3 className="font-medium">{t(title)}</h3>
        <p className="text-muted-foreground text-sm">{t(text)}</p>
      </div>
    </div>
  );
};

const Features = () => {
  const { mode } = useThemeStore();
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
