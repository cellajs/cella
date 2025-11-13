import type { GetNextPageParamFunction, QueryKey } from '@tanstack/react-query';
import { queryClient } from '~/query/query-client';
import type { InfiniteQueryData, PageParams, QueryData } from '~/query/types';
import { formatUpdatedCacheData } from '~/query/utils/mutate-query';

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

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

// Flatten all primitive keys recursively
type FlattenPrimitiveKeys<T> = {
  [K in keyof T]: T[K] extends Primitive ? K : T[K] extends object ? FlattenPrimitiveKeys<T[K]> : never;
}[keyof T];

// Nested primitives excluding keys that exist at the top-level
type NestedPrimitiveKeys<T> = Exclude<
  {
    [K in keyof T]: T[K] extends object
      ? FlattenPrimitiveKeys<T[K]> // get nested primitive keys
      : never;
  }[keyof T],
  keyof T // remove top-level keys
>;

type SortFunction<T> = (item: T) => Primitive;

interface FilterOptions<T> {
  q: string;
  sort: FlattenPrimitiveKeys<T>; // top-level + nested
  order: 'asc' | 'desc';
  searchIn: (keyof T)[];
  limit?: number;
  staleTime?: number;
  sortOptions?: Partial<Record<NestedPrimitiveKeys<T>, SortFunction<T>>>;
  additionalFilter?: (item: T) => boolean;
}

/**
 *  A reusable options preset for `useInfiniteQuery` that:
 *  - Uses cached data if all items are already fetched.
 *  - Skips unnecessary refetches unless data is stale or incomplete.
 *  - Provides initial filtered/sorted data for instant UI display (only when query is disabled).
 *
 *  Use this when you want no redundant network calls for filtering/sorting/search if the full dataset is already cached.
 */
// TODO make it work not on baseQueryKey, but on any sort that have full load
export const infiniteQueryUseCachedIfCompleteOptions = <T>(baseQueryKey: QueryKey, filterOptions: FilterOptions<T>) => {
  const isEnabled = () => {
    const state = queryClient.getQueryState<InfiniteQueryData<unknown>>(baseQueryKey);
    const queryStaleTime = filterOptions.staleTime ?? baseInfiniteQueryOptions.staleTime;

    // If no cache, error, or stale
    if (!state || state.error || !state.data || Date.now() - state.dataUpdatedAt > queryStaleTime) {
      return true;
    }

    const pages = state.data.pages;
    const totalCount = pages[pages.length - 1].total ?? 0;
    const fetchedCount = pages.reduce((acc, page) => acc + page.items.length, 0);

    // If not all items fetched
    return fetchedCount < totalCount;
  };

  return {
    /**
     * Controls whether the query should be executed.
     * It fetches only if:
     * - There is no cached data
     * - Cached data is stale
     * - The cache contains only partial items
     */
    enabled: isEnabled,
    /**
     * Provides initial data instantly from the cache.
     * Data is filtered and sorted locally according to `filterOptions`.
     * Avoids showing stale/unfiltered data during refetch.
     */
    initialData: () => {
      // Only hydrate if query is disabled
      if (isEnabled()) return;

      const cache = queryClient.getQueryData<InfiniteQueryData<T>>(baseQueryKey);
      if (!cache) return;

      const { q, sort, order, limit, sortOptions, searchIn, additionalFilter } = filterOptions;

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
          let aVal: Primitive;
          let bVal: Primitive;

          if (sort in (sortOptions ?? {})) {
            // Use sort function for nested keys
            const fn = sortOptions![sort as NestedPrimitiveKeys<T>];
            aVal = fn ? fn(a) : undefined;
            bVal = fn ? fn(b) : undefined;
          } else {
            const aRaw = a[sort as keyof T];
            const bRaw = b[sort as keyof T];
            aVal = aRaw !== null && aRaw !== undefined && typeof aRaw === 'object' ? null : (aRaw as Primitive);
            bVal = bRaw !== null && bRaw !== undefined && typeof bRaw === 'object' ? null : (bRaw as Primitive);
          }

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

      return formatUpdatedCacheData(cache, filteredItems, limit, totalChange) as InfiniteQueryData<T>;
    },
  };
};
