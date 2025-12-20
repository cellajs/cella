import { infiniteQueryOptions, queryOptions, useMutation } from '@tanstack/react-query';
import { RegisteredRouter, UseSearchResult } from '@tanstack/router-core';
import { appConfig } from 'config';
import {
  type CreatePageData,
  createPage,
  deletePages,
  type GetPagesData,
  getPage,
  getPages,
  type Page,
  type UpdatePageData,
  updatePage,
} from '~/api.gen';
import type { ApiError } from '~/lib/api';
import { parseBlocksText } from '~/lib/blocknote';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';
import { baseInfiniteQueryOptions } from '~/query/utils/infinite-query-options';
import { createEntityKeys } from '../entities/create-query-keys';

export const pagesLimit = appConfig.requestLimits.pages;

type PageFilters = Omit<GetPagesData['query'], 'limit' | 'offset'>;

const keys = createEntityKeys<PageFilters>('page');

/**
 * Page query keys.
 */
export const pageQueryKeys = keys;

export const pageQueryOptions = (id: string) =>
  queryOptions({
    queryKey: keys.detail.byId(id),
    queryFn: () => getPage({ path: { id } }),
  });

type PagesListParams = Omit<NonNullable<GetPagesData['query']>, 'limit' | 'offset'> & { limit?: number };

/**
 * Infinite query options to get a paginated list of pages.
 */
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
 * Custom hook to create a new page.
 */
export const usePageCreateMutation = () => {
  return useMutation<Page, ApiError, CreatePageData['body']>({
    mutationKey: keys.create,
    mutationFn: (body) => createPage({ body }),
    onSuccess: (createdPage) => {
      const mutateCache = useMutateQueryData(keys.list.base);

      mutateCache.create([createdPage]);
    },
  });
};

/**
 * Custom hook to update an existing page.
 */
export const usePageUpdateMutation = () => {
  return useMutation<Page, ApiError, { id: string; body: UpdatePageData['body'] }>({
    mutationKey: keys.update,
    mutationFn: ({ id, body }) => updatePage({ body, path: { id } }),
    onSuccess: (updatedPage) => {
      const mutateCache = useMutateQueryData(keys.list.base, () => keys.detail.base, ['update']);
      mutateCache.update([updatedPage]);
    },
  });
};

/**
 * Custom hook to delete pages.
 */
export const usePageDeleteMutation = () => {
  return useMutation<void, ApiError, Page[]>({
    mutationKey: keys.delete,
    mutationFn: async (pages) => {
      const ids = pages.map(({ id }) => id);
      await deletePages({ body: { ids } });
    },
    onSuccess: (_, pages) => {
      const mutateCache = useMutateQueryData(keys.list.base, () => keys.detail.base, ['remove']);

      mutateCache.remove(pages);
    },
  });
};

/**
 *
 * @param query
 * @param item
 * @returns
 */
export const filterPages = (
  query: UseSearchResult<RegisteredRouter, undefined, false, unknown>,
  item: Page,
): boolean => {
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
