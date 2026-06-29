import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { getPublicCounts } from 'sdk';
import { appConfig, type EntityType } from 'shared';

export const publicCountsQueryOptions = () =>
  queryOptions({
    queryKey: ['marketing', 'public-counts'],
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
