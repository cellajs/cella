import type { GetNextPageParamFunction } from '@tanstack/react-query';
import type { PageParams, QueryData } from '~/query/types';

/** Pages any `{ items, total }` response until all are fetched. staleTime is omitted so it inherits the global default from query-client.ts. */
export const baseInfiniteQueryOptions = {
  initialPageParam: { page: 0, offset: 0 },
  getNextPageParam: ((lastPage, allPages) => {
    const total = lastPage.total;
    const fetchedCount = allPages.reduce((acc, page) => acc + page.items.length, 0);

    if (fetchedCount >= total) return undefined;
    return { page: allPages.length, offset: fetchedCount };
  }) as GetNextPageParamFunction<PageParams, QueryData<unknown>>,
};
