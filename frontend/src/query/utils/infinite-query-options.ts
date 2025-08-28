import type { GetNextPageParamFunction, QueryKey } from '@tanstack/react-query';
import { queryClient } from '~/query/query-client';
import type { InfiniteQueryData, PageParams, QueryData } from '~/query/types';

/**
 * Base configuration object for `infiniteQueryOptions` in TanStack Query.
 *
 * Includes:
 * - `initialPageParam`: default page parameters `{ page: 0, offset: 0 }`.
 * - `staleTime`: cache freshness duration (2 minutes).
 * - `getNextPageParam`: generic pagination logic that works with
 *    API responses shaped like `{ items: T[]; total: number }`.
 *
 * Pagination logic:
 * - Counts how many items are fetched across all pages.
 * - If fetched count >= `total` → returns `undefined` (no more pages).
 * - Otherwise → returns next page params `{ page, offset }`.
 */
export const baseInfiniteQueryOptions = {
  initialPageParam: { page: 0, offset: 0 },
  staleTime: 1000 * 60 * 2, // 2 minutes
  getNextPageParam: ((lastPage, allPages) => {
    const total = lastPage.total;
    const fetchedCount = allPages.reduce((acc, page) => acc + page.items.length, 0);

    if (fetchedCount >= total) return undefined;
    return { page: allPages.length, offset: fetchedCount };
  }) as GetNextPageParamFunction<PageParams, QueryData<unknown>>,
};

type SortFunction<T> = (item: T) => string | number | null | undefined;

interface FilterOptions<T> {
  q: string;
  sort: keyof T;
  order: 'asc' | 'desc';
  searchIn: (keyof T)[];
  sortOptions?: Partial<Record<keyof T, SortFunction<T>>>;
  additionalFilter?: (item: T) => boolean;
}

/**
 * Filters and/or sorts items from a fully loaded infinite query for UI display.
 *
 * @template T - Type of individual items in the infinite query.
 * @param cache - Infinite query data containing pages of items.
 * @param options - Filtering and sorting options:
 *   - q: search query string
 *   - sort: key of T to sort by
 *   - order: 'asc' | 'desc'
 *   - searchIn: keys of T to search in
 *   - sortOptions: custom sort functions for specific keys
 *   - additionalFilter: optional additional filter function
 * @returns An object containing:
 *   - filteredItems: resulting filtered & sorted array of items
 *   - totalChange: difference in length compared to original cached items
 */
export const filterVisibleData = <T>(cache: InfiniteQueryData<T>, options: FilterOptions<T>): { filteredItems: T[]; totalChange: number } => {
  const { q, sort, order, sortOptions, searchIn, additionalFilter } = options;

  const cachedItems = cache.pages.flatMap((p) => p.items);
  const normalizedSearch = q.trim().toLowerCase();

  // Filter items
  const filteredItems = cachedItems
    .filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        searchIn.some((key) => {
          const value = item[key];
          if (value == null) return false;
          return String(value).toLowerCase().includes(normalizedSearch);
        });

      const additionalMatch = additionalFilter ? additionalFilter(item) : true;

      return matchesSearch && additionalMatch;
    })
    // Sort items
    .sort((a, b) => {
      const aVal = sortOptions?.[sort] ? sortOptions[sort](a) : a[sort] || '';
      const bVal = sortOptions?.[sort] ? sortOptions[sort](b) : b[sort] || '';

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return order === 'asc' ? aVal - bVal : bVal - aVal;
      }

      return order === 'asc'
        ? String(aVal).localeCompare(String(bVal), undefined, { sensitivity: 'base' })
        : String(bVal).localeCompare(String(aVal), undefined, { sensitivity: 'base' });
    });

  const totalChange = filteredItems.length - cachedItems.length;

  return { filteredItems, totalChange };
};

/**
 * Returns a function suitable for `enabled` option.
 *
 * Infinite query should be fetched:
 * 1. There is no cached data for query.
 * 2. Query encountered an error.
 * 3. Cached data is stale (older than `staleTime`).
 * 4. Not all pages/items have been fetched yet.
 *
 * @param queryKey - Query key used in TanStack Query.
 * @param staleTime - Time in milliseconds after which cached data is considered stale.
 * @returns Boolean
 */
export const infiniteQueryEnabled = (queryKey: QueryKey, staleTime = baseInfiniteQueryOptions.staleTime) => {
  const state = queryClient.getQueryState<InfiniteQueryData<unknown>>(queryKey);

  // If no cache, error, or stale
  if (!state || state.error || !state.data || Date.now() - state.dataUpdatedAt > staleTime) {
    return true;
  }

  const pages = state.data.pages;
  const totalCount = pages[pages.length - 1].total ?? 0;
  const fetchedCount = pages.reduce((acc, page) => acc + page.items.length, 0);

  // If not all items fetched
  return fetchedCount < totalCount;
};
