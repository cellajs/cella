import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';
import { appConfig, type EntityType } from 'config';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
import { CountUp } from 'use-count-up';
import { getPublicCounts } from '~/api.gen';
import { counts } from '~/modules/marketing/marketing-config';
import { Card, CardContent, CardHeader, CardTitle } from '~/modules/ui/card';

const countsLength = counts.length;

function Counters() {
  const { t } = useTranslation();
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0 });

  const queryParams = queryOptions({
    queryKey: ['counts'],
    queryFn: () => getPublicCounts(),
    initialData: appConfig.entityTypes.reduce(
      (acc, key) => {
        acc[key] = 0;
        return acc;
      },
      {} as Record<EntityType, number>,
    ),
    placeholderData: keepPreviousData,
  });

  const { data } = useQuery(queryParams);

  return (
    <div ref={ref} className={`mx-auto grid gap-4 md:max-w-5xl grid-cols-2 lg:grid-cols-${countsLength}`}>
      {inView &&
        counts.map(({ id, title, icon: Icon }) => {
          const countValue = data[id];

          return (
            <Card key={id} className="bg-background">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm sm:text-lg font-medium">{t(title)}</CardTitle>
                <Icon className="text-muted-foreground size-4 sm:size-6" strokeWidth={1.5} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  <CountUp
                    key={`count-${id}`}
                    isCounting
                    start={Math.floor(countValue / 2)}
                    end={countValue}
                    decimalPlaces={0}
                    formatter={(value) => Math.floor(value).toLocaleString()}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}

export default Counters;
