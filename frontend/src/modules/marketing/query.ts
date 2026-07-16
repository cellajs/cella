import { queryOptions } from '@tanstack/react-query';
import { getPublicCounts } from 'sdk';
import { appConfig, type EntityType } from 'shared';

const zeroCounts = appConfig.entityTypes.reduce(
  (acc, key) => {
    acc[key] = 0;
    return acc;
  },
  {} as Record<EntityType, number>,
);

export const publicCountsQueryOptions = () =>
  queryOptions({
    queryKey: ['marketing', 'public-counts'],
    queryFn: () => getPublicCounts(),
    // Zeros as placeholder, not initialData: initialData enters the cache as fresh real data,
    // which suppresses the first fetch entirely under global refetchOnMount: false.
    placeholderData: (prev) => prev ?? zeroCounts,
  });
