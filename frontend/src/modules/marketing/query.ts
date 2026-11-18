import { queryOptions } from '@tanstack/react-query';
import { type GetPublicCountsResponse, getPublicCounts } from 'sdk';
import { appConfig } from 'shared';

// The counted types: users and channel types, as the response names them.
const zeroCounts = Object.fromEntries(['user', ...appConfig.channelEntityTypes].map((type) => [type, 0])) as GetPublicCountsResponse;

export const publicCountsQueryOptions = () =>
  queryOptions({
    queryKey: ['marketing', 'public-counts'],
    queryFn: () => getPublicCounts(),
    // Zeros as placeholder: initialData would enter the cache as fresh data, and no mount within the stale time would fetch.
    placeholderData: (prev) => prev ?? zeroCounts,
  });
