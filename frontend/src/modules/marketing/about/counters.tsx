import { Building2, Users } from 'lucide-react';
import { ElementType, useEffect, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { CountUp } from 'use-count-up';
import { getPublicCounts } from '~/api/general';

import { Card, CardContent, CardHeader, CardTitle } from '~/modules/ui/card';

type IconType = ElementType;

interface CountMapping {
  [key: string]: {
    title: string;
    icon: IconType;
  };
}

const countMappings: CountMapping = {
  users: {
    title: 'Users',
    icon: Users,
  },
  organizations: {
    title: 'Organizations',
    icon: Building2,
  },
};

const Counters = () => {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0 });

  const [counts, setCounts] = useState({
    users: 0,
    organizations: 0,
  });

  useEffect(() => {
    getPublicCounts().then((counts) => setCounts(counts));
  }, []);

  const cardConfig = Object.entries(counts).map(([key, value]) => {
    const mapping = countMappings[key as keyof typeof countMappings];
    return {
      title: mapping.title,
      icon: mapping.icon,
      count: value,
    };
  });

  return (
    <div ref={ref} className="mx-auto grid gap-4 md:max-w-[64rem] md:grid-cols-2 lg:grid-cols-2">
      {inView &&
        cardConfig.map(({ title, icon: Icon, count }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{title}</CardTitle>
              <Icon className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                <CountUp
                  isCounting
                  start={Math.floor(count / 2)}
                  end={count}
                  decimalPlaces={0}
                  formatter={(value) => Math.floor(value).toLocaleString()}
                />
              </div>
            </CardContent>
          </Card>
        ))}
    </div>
  );
};

export default Counters;
