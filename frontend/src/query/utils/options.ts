import { infiniteQueryOptions, type QueryKey, queryOptions } from '@tanstack/react-query';
import { queryClient } from '~/query/query-client';
import { InfiniteQueryData } from '~/query/types';
import { formatUpdatedCacheData } from './mutate-query';

export const detailQueryOptions = <T>(
  {
    queryKey,
    queryFn,
  }: {
    queryKey: QueryKey;
    queryFn: () => Promise<T>;
  },
  orgIdOrSlug?: string,
) => {
  return queryOptions({
    queryKey,
    queryFn,
    ...(!orgIdOrSlug && {
      gcTime: 0,
      staleTime: 0,
    }),
  });
};

export const detailsQueryOptions = <T>(
  {
    queryKey,
    queryFn,
  }: {
    queryKey: QueryKey;
    queryFn: () => Promise<T>;
  },
  orgIdOrSlug?: string,
) => {
  return queryOptions({
    queryKey,
    queryFn,
    ...(!orgIdOrSlug && {
      gcTime: 0,
      staleTime: 0,
    }),
  });
};

type ListResponse<T> = { items: T[]; total: number };

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
const baseListQueryOptions = {
  initialPageParam: { page: 0, offset: 0 },
  staleTime: 1000 * 60 * 2, // 2 minutes
  getNextPageParam: <T>(lastPage: ListResponse<T>, allPages: ListResponse<T>[]) => {
    const total = lastPage.total;
    const fetchedCount = allPages.reduce((acc, page) => acc + page.items.length, 0);

    if (fetchedCount >= total) return undefined;
    return { page: allPages.length, offset: fetchedCount };
  },
};

const getEnabled = (key: QueryKey, staleTime = baseListQueryOptions.staleTime): (() => boolean) => {
  return () => {
    const state = queryClient.getQueryState<InfiniteQueryData<unknown>>(key);

    if (!state || state.error || !state.data || Date.now() - state.dataUpdatedAt > staleTime) {
      return true;
    }

    const pages = state.data.pages;

    const totalCount = pages.at(-1)?.total ?? 0;
    const fetchedCount = pages.reduce((acc, page) => acc + page.items.length, 0);

    // If not all items fetched
    return fetchedCount < totalCount;
  };
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

const isPrimitive = (value: unknown): value is Primitive => {
  return typeof value !== 'function' && (typeof value !== 'object' || value === null);
};

type FilterOptions<T> = {
  q: string;
  sort: FlattenPrimitiveKeys<T>; // top-level + nested
  order: 'asc' | 'desc';
  searchIn: (keyof T)[];
  limit?: number;
  staleTime?: number;
  sortOptions?: {
    [K in NestedPrimitiveKeys<T> & string]?: (item: T) => Primitive;
  };
  additionalFilter?: (item: T) => boolean;
};

const getInitialData = <T>(
  key: QueryKey,
  { staleTime = baseListQueryOptions.staleTime, ...filterOptions }: FilterOptions<T>,
): (() => InfiniteQueryData<T> | undefined) => {
  return () => {
    if (getEnabled(key, staleTime)) {
      return;
    }

    const cache = queryClient.getQueryData<InfiniteQueryData<T>>(key);
    if (!cache) {
      return;
    }

    const { q, sort, order, limit, sortOptions, searchIn, additionalFilter } = filterOptions;
    const normalizedSearch = q.trim().toLowerCase();

    const cachedItems = cache.pages.flatMap((p) => p.items);
    const filteredItems = cachedItems
      // Filter items
      .filter((item) => {
        const matchesSearch =
          !normalizedSearch ||
          searchIn.some((key) => {
            const value = item[key];
            if (value === null) return false;
            return String(value).toLowerCase().includes(normalizedSearch);
          });

        const additionalMatch = additionalFilter ? additionalFilter(item) : true;

        return matchesSearch && additionalMatch;
      })
      // Sort items
      .sort((a, b) => {
        let aVal: Primitive;
        let bVal: Primitive;

        if (sortOptions && sort in sortOptions) {
          // Use sort function for nested keys
          const fn = sortOptions[sort as keyof typeof sortOptions];
          aVal = fn?.(a);
          bVal = fn?.(b);
        } else {
          const aRaw = a[sort as keyof T];
          const bRaw = b[sort as keyof T];
          aVal = isPrimitive(aRaw) ? aRaw : null;
          bVal = isPrimitive(bRaw) ? bRaw : null;
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
  };
};

// type ListQueryParams<T, O> = O extends string | number | symbol
//   ? Omit<NonNullable<T>, O> & { limit?: number }
//   : NonNullable<T> & { limit?: number }

export const listQueryOptions = <T>(
  {
    queryKey,
    queryFn,
    limit,
    cachedQuery,
  }: {
    queryKey: QueryKey;
    queryFn: (params: { limit: number; offset: number }, signal: AbortSignal) => Promise<ListResponse<T>>;
    limit: number;
    cachedQuery?: {
      queryKey: QueryKey;
      filterOptions: FilterOptions<T>;
    };
  },
  orgIdOrSlug?: string,
) => {
  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam, signal }) => {
      // order of operations?
      const offset = pageParam.offset || (pageParam.page || 0) * limit;
      return await queryFn({ limit, offset }, signal);
    },
    ...baseListQueryOptions,
    ...(orgIdOrSlug && {
      gcTime: 0,
      staleTime: 0,
    }),
    refetchOnWindowFocus: false,
    ...(cachedQuery && {
      enabled: getEnabled(cachedQuery.queryKey),
      initialData: getInitialData<T>(cachedQuery.queryKey, cachedQuery.filterOptions),
    }),
    // select: ({ pages }) => pages.flatMap(({ items }) => items),
  });
};
