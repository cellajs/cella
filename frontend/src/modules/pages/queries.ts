import { infiniteQueryOptions, QueryKey, queryOptions } from '@tanstack/react-query';
import { RegisteredRouter, UseSearchResult } from '@tanstack/router-core';
import { appConfig } from 'config';
import { GetPagesData, getPage, getPages, Page } from '~/api.gen';
import { parseBlocksText } from '~/lib/blocknote';
import { baseInfiniteQueryOptions } from '~/query/utils/infinite-query-options';

type PagesQuery = Exclude<GetPagesData['query'], undefined>;

/** Pages request limit */
export const pagesLimit = appConfig.requestLimits.pages;
/** Pages accepted cutoff days */
// const ACCEPTED_CUTOFF_DAYS = 14;

/**
 * Pages query key factory
 * @see https://tkdodo.eu/blog/effective-react-query-keys#use-query-key-factories
 */
const pagesKeys = {
  all: ['pages'] as const,
  list: {
    base: () => [...pagesKeys.all, 'list'] as const,
    private: (query: PagesQuery) => [...pagesKeys.list.base(), query] as const,
    public: (query: PagesQuery) => [...pagesKeys.list.base(), 'public', query] as const,
  },
  details: {
    base: () => [...pagesKeys.all, 'details'] as const,
    private: (query: PagesQuery) => [...pagesKeys.details.base(), query] as const,
    public: (query: PagesQuery) => [...pagesKeys.details.base(), 'public', query] as const,
  },
  detail: {
    base: () => [...pagesKeys.all],
    private: (id: string) => [...pagesKeys.details.base(), id] as const,
    public: (id: string) => [...pagesKeys.detail.base(), 'public', id] as const,
  },
};

// #region Detail (Single)

const detailQueryOptions = <T>(
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

export const pageQueryOptions = (id: string, orgIdOrSlug?: string) => {
  return detailQueryOptions(
    {
      queryKey: orgIdOrSlug ? pagesKeys.detail.private(id) : pagesKeys.detail.public(id),
      queryFn: async () => {
        return await getPage({
          path: {
            id,
            // orgIdOrSlug,
          },
        });
      },
    },
    orgIdOrSlug,
  );
};

// #endregion

// #region Details (Board)

const detailsQueryOptions = <T>(
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
    // queryKey: [table, filter, sort, limit, offset],
    queryKey,
    queryFn,
    ...(!orgIdOrSlug && {
      gcTime: 0,
      staleTime: 0,
    }),
  });
};

export const pagesDetailsQueryOptions = (query: PagesQuery, orgIdOrSlug?: string) => {
  return detailsQueryOptions(
    {
      queryKey: orgIdOrSlug ? pagesKeys.details.private(query) : pagesKeys.details.public(query),
      queryFn: async () => {
        return await getPages({
          // path: { orgIdOrSlug },
          query: {
            offset: '0',
            limit: pagesLimit.toString(),
            // acceptedCutoff: ACCEPTED_CUTOFF_DAYS,
          },
        });
      },
    },
    orgIdOrSlug,
  );
};

// #endregion

// #region List (Infinite)

const { initialPageParam, staleTime } = baseInfiniteQueryOptions;

const listQueryOptions = <T>(
  {
    queryKey,
    queryFn,
    limit,
  }: {
    queryKey: QueryKey;
    queryFn: (params: { limit: number; offset: number }, signal: AbortSignal) => Promise<ListResponse<T>>;
    limit: number;
  },
  orgIdOrSlug?: string,
) => {
  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam, signal }) => {
      // order of operations?
      const offset = pageParam.offset || (pageParam.page || 0) * limit;
      // return result of getter with path, query, and signal
      return await queryFn({ limit, offset }, signal);
    },
    initialPageParam,
    getNextPageParam: (lastPage, allPages) => {
      const fetchedCount = allPages.reduce((acc, page) => acc + page.items.length, 0);
      // can this be done server-side?
      return fetchedCount < lastPage.total ? { page: allPages.length, offset: fetchedCount } : undefined;
    },
    staleTime,
    ...(orgIdOrSlug && {
      gcTime: 0,
      staleTime: 0,
    }),
    refetchOnWindowFocus: false,
    // infiniteQueryUseCachedIfCompleteOptions
  });
};

type InfinitePagesQuery = Omit<PagesQuery, 'limit'> & {
  limit?: number;
};

export const pagesListQueryOptions = (
  { q = '', sort = 'createdAt', order = 'desc', limit = pagesLimit, offset }: InfinitePagesQuery,
  orgIdOrSlug?: string,
) => {
  const query: PagesQuery = {
    q,
    sort,
    order,
    limit: limit.toString(),
    offset,
  };

  return listQueryOptions(
    {
      queryKey: orgIdOrSlug ? pagesKeys.list.private(query) : pagesKeys.list.public(query),
      queryFn: async (params, signal) => {
        return await getPages({
          // path: { orgIdOrSlug },
          query: {
            limit: params.limit.toString(),
            offset: params.offset.toString(),
            ...query,
          },
          signal,
        });
      },
      limit: limit ?? pagesLimit,
    },
    orgIdOrSlug,
  );
};

// #endregion

/** WIP - Generic core query type */
// type Query<T, S extends keyof T = keyof T> = {
//   q?: string;
//   sort?: S;
//   order?: 'asc' | 'desc';
//   limit?: number;
// }

/** WIP - Generic core response type */
type ListResponse<T> = { items: T[]; total: number };

// #region helpers

/**
 *
 * @param query
 * @param item
 * @returns
 */
export const filterPages = (query: UseSearchResult<RegisteredRouter, undefined, false, unknown>, item: Page): boolean => {
  // Always allow empty search (or create flag?)
  if (!query.q) {
    return true;
  }

  const matchMode = 'all';
  // const { matchMode = 'all' } = query;

  const normalized = query.q.trim().toLowerCase();
  const raw = normalized.startsWith('=') ? normalized.slice(1) : normalized;

  const keywords = raw.split(/\s+/).filter(Boolean);

  // No filtering if there are no valid search keywords
  if (!keywords.length) {
    return true;
  }

  return [
    item.title.toLowerCase(),
    item.keywords.toLowerCase(),
    parseBlocksText(item.content),
    // match author
  ].some((item) => {
    return matchMode === 'all' ? item.includes(raw) : keywords.some((w) => item.includes(w));
  });
};

// #endregion
