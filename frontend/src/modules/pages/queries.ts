import { infiniteQueryOptions } from '@tanstack/react-query';
import { RegisteredRouter, UseSearchResult } from '@tanstack/router-core';
import { appConfig } from 'config';
import { type GetPagesData, getPages, type Page } from '~/api.gen';
import { parseBlocksText } from '~/lib/blocknote';
import { baseInfiniteQueryOptions } from '~/query/utils/infinite-query-options';
import { createEntityKeys } from '../entities/create-query-keys';

export const pagesLimit = appConfig.requestLimits.pages;

type PageFilters = Omit<GetPagesData['query'], 'limit' | 'offset'>;

const keys = createEntityKeys<PageFilters>('page');

export const pageQueryKeys = keys;

type PagesListParams = Omit<NonNullable<GetPagesData['query']>, 'limit' | 'offset'> & { limit?: number };

export const pagesListQueryOptions = (params: PagesListParams) => {
  const { q = '', sort = 'createdAt', order = 'desc', limit: baseLimit = pagesLimit } = params;

  const limit = String(baseLimit);

  const keyFilters = { q, sort, order };

  const queryKey = keys.list.filtered(keyFilters);
  const baseQuery = { ...keyFilters, limit };

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset ?? (page ?? 0) * Number(limit));

      return getPages({
        query: { ...baseQuery, offset },
        signal,
      });
    },
    ...baseInfiniteQueryOptions,
  });
};

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
