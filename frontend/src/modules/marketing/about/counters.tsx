import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useInView } from '~/hooks/use-in-view';
import { RollingNumber } from '~/modules/marketing/about/rolling-number';
import { counts } from '~/modules/marketing/marketing-config';
import { publicCountsQueryOptions } from '~/modules/marketing/query';
import { Card, CardContent, CardHeader, CardTitle } from '~/modules/ui/card';
import { cn } from '~/utils/cn';

// Literal class names so Tailwind generates them; an app with more counters than listed falls back to four columns
const lgGridCols: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
};
const countsGridClass = lgGridCols[counts.length] ?? 'lg:grid-cols-4';

export function Counters() {
  const { t } = useTranslation();
  const { ref, inView } = useInView({ once: true });

  const { data } = useQuery(publicCountsQueryOptions());

  return (
    <div ref={ref} className={cn('mx-auto grid grid-cols-2 gap-4 md:max-w-5xl', countsGridClass)}>
      {counts.map(({ id, title, icon: Icon }) => (
        <Card key={id} className="bg-background">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium sm:text-lg">{t(title)}</CardTitle>
            <Icon className="text-muted-foreground size-4 sm:size-6" />
          </CardHeader>
          <CardContent>
            <div className="flex text-3xl font-bold">
              <RollingNumber value={data?.[id] ?? 0} roll={inView} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
