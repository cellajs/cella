import type { GetNextPageParamFunction } from '@tanstack/react-query';
import type { PageParams, QueryData } from '~/query/types';

/**
 * Reusable base for `infiniteQueryOptions`: `initialPageParam` plus a `getNextPageParam` that pages
 * any `{ items: T[]; total: number }` response until all items are fetched.
 * staleTime is intentionally omitted so it inherits the global default from query-client.ts (1 min online, infinite offline).
 */
export const baseInfiniteQueryOptions = {
  initialPageParam: { page: 0, offset: 0 },
  getNextPageParam: ((lastPage, allPages) => {
    const total = lastPage.total;
    const fetchedCount = allPages.reduce((acc, page) => acc + page.items.length, 0);

    if (fetchedCount >= total) return undefined;
    return { page: allPages.length, offset: fetchedCount };
  }) as GetNextPageParamFunction<PageParams, QueryData<unknown>>,
};
