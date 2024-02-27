import { useTranslation } from 'react-i18next';
import { useThemeStore } from '~/store/theme';

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
        <img src={`/features/${icon}.svg`} alt={title} className={`h-12 w-12 object-contain ${invertClass}`} loading="lazy" />
        <div className="space-y-2">
          <h3 className="font-medium">{t(title)}</h3>
          <p className="text-muted-foreground text-sm">{t(text)}</p>
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
        {visibleFeatures.map((feature, index) => (
          <Feature key={feature.icon} {...feature} index={index} invertClass={invertClass} />
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
