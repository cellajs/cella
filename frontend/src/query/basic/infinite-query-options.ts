import type { GetNextPageParamFunction } from '@tanstack/react-query';
import type { PageParams, QueryData } from '~/query/types';

/**
 *  A reusable base options for `infiniteQueryOptions`.
 *
 *  Includes:
 *  - `initialPageParam`: default page parameters `{ page: 0, offset: 0 }`.
 *  - `getNextPageParam`: generic pagination logic that works with
 *    API responses shaped like `{ items: T[]; total: number }`.
 *
 *  Pagination logic:
 *  - Counts how many items are fetched across all pages.
 *  - If fetched count >= `total` → returns `undefined` (no more pages).
 *  - Otherwise → returns next page params `{ page, offset }`.
 *
 *  Note: staleTime uses global default from query-client.ts (1 min online, infinite offline).
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
