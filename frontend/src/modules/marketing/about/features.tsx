import { useTranslation } from 'react-i18next';
import { useThemeStore } from '~/store/theme';

type FeatureProps = {
  title: string;
  description: string;
  icon: string;
  invertClass: string;
};
const features = [
  {
    title: 'common:about.feature.title_1',
    description: 'common:about.feature.description_1',
    icon: 'hono',
  },
  {
    title: 'common:about.feature.title_2',
    description: 'common:about.feature.description_2',
    icon: 'react',
  },
  {
    title: 'common:about.feature.title_3',
    description: 'common:about.feature.description_3',
    icon: 'drizzle',
  },
  {
    title: 'common:about.feature.title_4',
    description: 'common:about.feature.description_4',
    icon: 'tailwind',
  },
  {
    title: 'common:about.feature.title_5',
    description: 'common:about.feature.description_5',
    icon: 'lucia',
  },
  {
    title: 'common:about.feature.title_6',
    description: 'common:about.feature.description_6',
    icon: 'openapi',
  },
  {
    title: 'common:about.feature.title_7',
    description: 'common:about.feature.description_7',
    icon: 'vite',
  },
  {
    title: 'common:about.feature.title_8',
    description: 'common:about.feature.description_8',
    icon: 'tanstack',
  },
  {
    title: 'common:about.feature.title_9',
    description: 'common:about.feature.description_9',
    icon: 'plus',
  },
];

const Feature = ({ title, description, icon, invertClass }: FeatureProps) => {
  const { t } = useTranslation();

  return (
    <div className="bg-card relative overflow-hidden rounded-lg p-2">
      <div className="flex h-[180px] flex-col justify-between rounded-md p-6">
        <img src={`/features/${icon}.svg`} alt={title} className={`h-12 w-12 object-contain ${invertClass}`} loading="lazy" />
        <div className="space-y-2">
          <h3 className="font-medium">{t(title)}</h3>
          <p className="text-muted-foreground text-sm">{t(description)}</p>
        </div>
      </div>
    </div>
  );
};

import { ArrowDown } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { useBreakpoints } from '../../../hooks/use-breakpoints';

const Features = () => {
  const { t } = useTranslation();
  const { mode } = useThemeStore();
  const invertClass = mode === 'dark' ? 'invert' : '';
  const isMediumScreen = useBreakpoints('min', 'md');

  const [showAllFeatures, setShowAllFeatures] = useState(isMediumScreen);

  const visibleFeatures = showAllFeatures ? features : features.slice(0, 4);

  const handleLoadMore = () => {
    setShowAllFeatures(true);
  };

  return (
    <>
      <div className="mx-auto grid max-w-[64rem] justify-center gap-4 sm:grid-cols-2 md:grid-cols-3">
        {visibleFeatures.map((feature) => (
          <Feature key={feature.title} {...feature} invertClass={invertClass} />
        ))}
      </div>

      {!showAllFeatures && features.length > 4 && (
        <Button variant="ghost" className="w-full mt-4" onClick={handleLoadMore}>
          <Badge className="mr-2">5</Badge>
          {t('common:more_features')}
          <ArrowDown className="ml-2" size={16} />
        </Button>
      )}
    </>
  );
};

export default Features;
