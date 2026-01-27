import type { GetNextPageParamFunction, QueryKey } from '@tanstack/react-query';
import { formatUpdatedCacheData } from '~/query/basic/mutate-query';
import { queryClient } from '~/query/query-client';
import type { InfiniteQueryData, PageParams, QueryData } from '~/query/types';

/**
 *  A reusable base options for `infiniteQueryOptions`.
 *
 *  Includes:
 *  - `initialPageParam`: default page parameters `{ page: 0, offset: 0 }`.
 *  - `staleTime`: cache freshness duration (2 minutes).
 *  - `getNextPageParam`: generic pagination logic that works with
 *    API responses shaped like `{ items: T[]; total: number }`.
 *
 *  Pagination logic:
 *  - Counts how many items are fetched across all pages.
 *  - If fetched count >= `total` → returns `undefined` (no more pages).
 *  -  Otherwise → returns next page params `{ page, offset }`.
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

interface FilterOptions<T> {
  q: string;
  sort: keyof T | (string & {});
  order: 'asc' | 'desc';
  searchIn: (keyof T)[];
  limit?: number;
  sortOptions?: Record<string, (item: T) => unknown>;
  additionalFilter?: (item: T) => boolean;
}

/** Filter and sort items based on filter options. */
const filterAndSortItems = <T>(items: T[], opts: FilterOptions<T>): T[] => {
  const { q, sort, order, searchIn, additionalFilter, sortOptions } = opts;
  const search = q.trim().toLowerCase();

  return items
    .filter((item) => {
      if (
        search &&
        !searchIn.some((k) =>
          String(item[k] ?? '')
            .toLowerCase()
            .includes(search),
        )
      )
        return false;
      return additionalFilter ? additionalFilter(item) : true;
    })
    .toSorted((a, b) => {
      const getter = sortOptions?.[sort as string];
      const aVal = getter ? getter(a) : (a as Record<string, unknown>)[sort as string];
      const bVal = getter ? getter(b) : (b as Record<string, unknown>)[sort as string];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp =
        typeof aVal === 'string' && typeof bVal === 'string'
          ? aVal.localeCompare(bVal, undefined, { sensitivity: 'base' })
          : aVal < bVal
            ? -1
            : aVal > bVal
              ? 1
              : 0;
      return order === 'asc' ? cmp : -cmp;
    });
};

/**
 * A composable options preset for `infiniteQueryOptions` that enables client-side
 * filtering/sorting from a cached base query using React Query's native patterns.
 *
 * Uses `initialData` + `initialDataUpdatedAt` for instant display of filtered cache,
 * while respecting `staleTime` for automatic background refetches when needed.
 */
export const infiniteQueryUseCachedIfCompleteOptions = <T>(baseQueryKey: QueryKey, filterOptions: FilterOptions<T>) => {
  const { limit } = filterOptions;

  return {
    /** Pre-fill with filtered/sorted data from base cache for instant UI. */
    initialData: () => {
      const cache = queryClient.getQueryData<InfiniteQueryData<T>>(baseQueryKey);
      if (!cache) return undefined;

      const cachedItems = cache.pages.flatMap((p) => p.items);
      const filteredItems = filterAndSortItems(cachedItems, filterOptions);
      const totalChange = filteredItems.length - cachedItems.length;

      return formatUpdatedCacheData(cache, filteredItems, limit, totalChange) as InfiniteQueryData<T>;
    },
    /** Pass through base cache timestamp so staleTime is respected correctly. */
    initialDataUpdatedAt: () => queryClient.getQueryState(baseQueryKey)?.dataUpdatedAt,
  };
};
