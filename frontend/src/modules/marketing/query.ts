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
    // Zeros as placeholder: initialData would enter the cache as fresh data, so the global refetchOnMount: false would skip the first fetch.
    placeholderData: (prev) => prev ?? zeroCounts,
  });
