import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';
import { queryClient } from '~/query/query-client';
import { flattenInfiniteData } from '~/query/utils/flatten';
import { baseInfiniteQueryOptions } from '~/query/utils/infinite-query-options';
import { nanoid } from '~/utils/nanoid';
import { createEntityKeys } from '../entities/create-query-keys';

export const pagesLimit = appConfig.requestLimits.pages;

type PageFilters = Omit<GetPagesData['query'], 'limit' | 'offset'>;

const keys = createEntityKeys<PageFilters>('page');

/**
 * Page query keys.
 */
export const pageQueryKeys = keys;

/**
 * Find a page in the list cache by id.
 * Searches through all cached page list queries.
 */
export const findPageInListCache = (id: string): Page | undefined => {
  const queries = queryClient.getQueryCache().findAll({ queryKey: keys.list.base });

  for (const query of queries) {
    const items = flattenInfiniteData<Page>(query.state.data);
    const found = items.find((page) => page.id === id);
    if (found) return found;
  }

  return undefined;
};

/**
 * Query options for a single page by id.
 * Uses initialData from the pages list cache to provide
 * instant loading while revalidating in the background.
 */
export const pageQueryOptions = (id: string) =>
  queryOptions({
    queryKey: keys.detail.byId(id),
    queryFn: async () => getPage({ path: { id } }),
    initialData: () => findPageInListCache(id),
    staleTime: 30_000,
  });

type PagesListParams = Omit<NonNullable<GetPagesData['query']>, 'limit' | 'offset'> & {
  limit?: number;
};

/**
 * Infinite query options to get a paginated list of pages.
 */
export const pagesQueryOptions = (params: PagesListParams = {}) => {
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
 * Custom hook to create a new page with optimistic updates.
 * The new page appears immediately in the UI while the server request is in flight.
 */
export const usePageCreateMutation = () => {
  const qc = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation<Page, ApiError, CreatePageData['body'], { optimisticPage: Page }>({
    mutationKey: keys.create,
    mutationFn: (body) => createPage({ body }),

    onMutate: async (newPageData) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await qc.cancelQueries({ queryKey: keys.list.base });

      // Create optimistic page with temporary id
      const optimisticPage: Page = {
        id: `temp-${nanoid()}`,
        entityType: 'page',
        createdAt: new Date().toISOString(),
        createdBy: null,
        modifiedAt: null,
        modifiedBy: null,
        ...newPageData,
      } as Page;

      // Add to cache optimistically
      mutateCache.create([optimisticPage]);

      return { optimisticPage };
    },

    onError: (_err, _newPage, context) => {
      // Remove the optimistic page on error
      if (context?.optimisticPage) {
        mutateCache.remove([context.optimisticPage]);
      }
    },

    onSuccess: (createdPage, _variables, context) => {
      // Replace optimistic page with real data from server
      if (context?.optimisticPage) {
        mutateCache.remove([context.optimisticPage]);
      }
      mutateCache.create([createdPage]);
    },

    onSettled: () => {
      // Always refetch to ensure cache is in sync
      qc.invalidateQueries({ queryKey: keys.list.base });
    },
  });
};

/**
 * Custom hook to update an existing page with optimistic updates.
 */
export const usePageUpdateMutation = () => {
  const qc = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base, () => keys.detail.base, ['update']);

  return useMutation<Page, ApiError, { id: string; body: UpdatePageData['body'] }, { previousPage: Page | undefined }>({
    mutationKey: keys.update,
    mutationFn: ({ id, body }) => updatePage({ body, path: { id } }),

    onMutate: async ({ id, body }) => {
      // Cancel outgoing refetches
      await qc.cancelQueries({ queryKey: keys.list.base });
      await qc.cancelQueries({ queryKey: keys.detail.byId(id) });

      // Snapshot previous value
      const previousPage = findPageInListCache(id);

      if (previousPage) {
        // Optimistically update in cache
        const optimisticPage = { ...previousPage, ...body, modifiedAt: new Date().toISOString() };
        mutateCache.update([optimisticPage]);
      }

      return { previousPage };
    },

    onError: (_err, _variables, context) => {
      // Rollback to previous value
      if (context?.previousPage) {
        mutateCache.update([context.previousPage]);
      }
    },

    onSuccess: (updatedPage) => {
      // Update with real data from server
      mutateCache.update([updatedPage]);
    },

    onSettled: (_data, _error, { id }) => {
      // Refetch to ensure cache is in sync
      qc.invalidateQueries({ queryKey: keys.list.base });
      qc.invalidateQueries({ queryKey: keys.detail.byId(id) });
    },
  });
};

/**
 * Custom hook to delete pages with optimistic updates.
 */
export const usePageDeleteMutation = () => {
  const qc = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base, () => keys.detail.base, ['remove']);

  return useMutation<void, ApiError, Page[], { deletedPages: Page[] }>({
    mutationKey: keys.delete,
    mutationFn: async (pages) => {
      const ids = pages.map(({ id }) => id);
      await deletePages({ body: { ids } });
    },

    onMutate: async (pagesToDelete) => {
      // Cancel outgoing refetches
      await qc.cancelQueries({ queryKey: keys.list.base });

      // Remove from cache optimistically
      mutateCache.remove(pagesToDelete);

      return { deletedPages: pagesToDelete };
    },

    onError: (_err, _pages, context) => {
      // Restore deleted pages on error
      if (context?.deletedPages) {
        mutateCache.create(context.deletedPages);
      }
    },

    onSettled: () => {
      // Refetch to ensure cache is in sync
      qc.invalidateQueries({ queryKey: keys.list.base });
    },
  });
};
