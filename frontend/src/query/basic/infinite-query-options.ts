import type { GetNextPageParamFunction } from '@tanstack/react-query';
import type { PageParams, QueryData } from '~/query/types';

/** Pages any `{ items, total }` response until all are fetched. staleTime is omitted so it inherits the global default from query-client.ts. */
export const baseInfiniteQueryOptions = {
  initialPageParam: { page: 0, offset: 0 },
  getNextPageParam: ((lastPage, allPages) => {
    const total = lastPage.total;
    const fetchedCount = allPages.reduce((acc, page) => acc + page.items.length, 0);

    // An empty page means the server has no more rows regardless of what `total` claims; without
    // this guard a drifted denormalized total re-requests the same offset in an unthrottled loop.
    if (lastPage.items.length === 0) return undefined;
    if (fetchedCount >= total) return undefined;
    return { page: allPages.length, offset: fetchedCount };
  }) as GetNextPageParamFunction<PageParams, QueryData<unknown>>,
};
