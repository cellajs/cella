import type { GetNextPageParamFunction } from '@tanstack/react-query';
import type { PageParams, QueryData } from '~/query/types';

/**
 * A generic `getNextPageParam` implementation for `useInfiniteQuery`.
 * It work with standart query return data shaped like: { items: T[]; total: number; }
 *
 * Logic:
 * - It calculates how many items have been fetched across all loaded pages.
 * - If number of fetched items is greater than or equal to `total`
 *   reported by last page, it returns `undefined` (➡ no more pages).
 * - Otherwise, it returns next page parameters `{ page, offset }`.
 */
export const baseGetNextPageParam: GetNextPageParamFunction<PageParams, QueryData<unknown>> = (lastPage, allPages) => {
  // total is reported by the API in lastPage
  const total = lastPage.total;
  // count how many items we’ve fetched so far
  const fetchedCount = allPages.reduce((acc, page) => acc + page.items.length, 0);

  // if we already have all items → no next page
  if (fetchedCount >= total) return undefined;

  // otherwise, return next page params
  return { page: allPages.length, offset: fetchedCount };
};
