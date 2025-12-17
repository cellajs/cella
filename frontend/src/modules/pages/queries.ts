import { infiniteQueryOptions } from '@tanstack/react-query';
import { RegisteredRouter, UseSearchResult } from '@tanstack/router-core';
import { appConfig } from 'config';
import { type GetPagesData, getPages, type Page } from '~/api.gen';
import { parseBlocksText } from '~/lib/blocknote';
import { baseInfiniteQueryOptions } from '~/query/utils/infinite-query-options';

export const pagesLimit = appConfig.requestLimits.pages;

type sortKey = NonNullable<NonNullable<GetPagesData['query']>['sort']>;

type Options<TSortKey extends string = string> = {
  q?: string;
  sort?: TSortKey;
  order?: 'asc' | 'desc';
  limit?: number;
  isPublic?: boolean;
};

type ByIdOptions<TSortKey extends string = string> = Options<TSortKey> & {
  id: string;
};

type InfiniteOptions<TSortKey extends string = string> = Options<TSortKey> & {
  limit: number;
};

type QueryKeys = {
  [K in keyof typeof keys]: (typeof keys)[K] extends (...args: any) => any ? ReturnType<(typeof keys)[K]> : (typeof keys)[K];
};

const keys = {
  all: [{ scope: 'pages' }] as const,
  list: <TOptions extends InfiniteOptions<sortKey> = InfiniteOptions<sortKey>>(options: TOptions) =>
    [{ ...keys.all[0], mode: 'list', ...options }] as const,
  details: <TOptions extends Options<sortKey> = Options<sortKey>>(options: TOptions) => [{ ...keys.all[0], mode: 'details', ...options }] as const,
  detail: <TOptions extends ByIdOptions<sortKey> = ByIdOptions<sortKey>>(options: TOptions) =>
    [{ ...keys.all[0], mode: 'detail', ...options }] as const,
};

export const pagesQueryKeys = keys;

// #region Queries

export const pagesListQueryOptions = <TQueryKey extends QueryKeys['list']>(queryKey: TQueryKey) => {
  const [{ scope, isPublic, limit, ...query }] = queryKey;

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam, signal }) => {
      // order of operations?
      const offset = pageParam.offset || (pageParam.page || 0) * limit;

      return await getPages({
        // path: { orgIdOrSlug },
        query: {
          limit: limit.toString(),
          offset: offset.toString(),
          ...query,
        },
        signal,
      });
    },
    ...baseInfiniteQueryOptions,
    select: ({ pages }) => pages.flatMap(({ items }) => items),
  });
};

// #endregion

// #region Helpers

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

  // const { matchMode = 'all' } = query;
  const matchMode = 'all';

  const normalized = query.q.trim().toLowerCase();
  const raw = normalized.startsWith('=') ? normalized.slice(1) : normalized;

  const keywords = raw.split(/\s+/).filter(Boolean);

  // No filtering if there are no valid search keywords
  if (!keywords.length) {
    return true;
  }

  return [
    item.name.toLowerCase(),
    item.keywords.toLowerCase(),
    parseBlocksText(item.description),
    // match author
  ].some((item) => {
    return matchMode === 'all' ? item.includes(raw) : keywords.some((w) => item.includes(w));
  });
};

// #endregion
