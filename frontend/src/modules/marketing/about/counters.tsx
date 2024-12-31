import { config } from 'config';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
import { CountUp } from 'use-count-up';
import { counts } from '~/modules/marketing/about/about-config';
import { getPublicCounts } from '~/modules/metrics/api';
import { Card, CardContent, CardHeader, CardTitle } from '~/modules/ui/card';

const Counters = () => {
  const { t } = useTranslation();
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0 });
  const initialObject = config.entityTypes.reduce(
    (acc, key) => {
      acc[key] = 0;
      return acc;
    },
    {} as Record<string, number>,
  );
  const [countValues, setCountValues] = useState(initialObject);

  useEffect(() => {
    getPublicCounts().then((resp) => setCountValues(resp));
  }, []);

  return (
    <div ref={ref} className="mx-auto grid gap-4 md:max-w-5xl md:grid-cols-2 lg:grid-cols-2">
      {inView &&
        counts.map(({ id, title, icon: Icon }) => {
          const countValue = countValues[id];

          return (
            <Card key={id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t(title)}</CardTitle>
                <Icon className="text-muted-foreground h-4 w-4" />
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
};

export default Counters;
