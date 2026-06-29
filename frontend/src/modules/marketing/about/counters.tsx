import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
import { counts } from '~/modules/marketing/marketing-config';
import { publicCountsQueryOptions } from '~/modules/marketing/query';
import { Card, CardContent, CardHeader, CardTitle } from '~/modules/ui/card';

export function useCountUp(start: number, end: number, duration = 1500) {
  const [value, setValue] = useState(start);
  useEffect(() => {
    const t0 = performance.now();
    let raf: number;
    const step = (now: number) => {
      const progress = Math.min((now - t0) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.floor(start + (end - start) * eased));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [start, end, duration]);
  return value;
}

function CountUp({ start, end }: { start: number; end: number }) {
  const value = useCountUp(start, end);
  return <>{value.toLocaleString()}</>;
}

const countsLength = counts.length;

export function Counters() {
  const { t } = useTranslation();
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0 });

  const { data } = useQuery(publicCountsQueryOptions());

  return (
    <div ref={ref} className={`mx-auto grid grid-cols-2 gap-4 md:max-w-5xl lg:grid-cols-${countsLength}`}>
      {inView &&
        counts.map(({ id, title, icon: Icon }) => {
          const countValue = data[id];

          return (
            <Card key={id} className="bg-background">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="font-medium text-sm sm:text-lg">{t(title)}</CardTitle>
                <Icon className="size-4 text-muted-foreground sm:size-6" strokeWidth={1.5} />
              </CardHeader>
              <CardContent>
                <div className="font-bold text-3xl">
                  <CountUp start={Math.floor(countValue / 2)} end={countValue} />
                </div>
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}
