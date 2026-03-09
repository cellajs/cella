import {
  infiniteQueryOptions,
  type QueryClient,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { appConfig } from 'shared';
import {
  type CreatePagesData,
  createPages,
  deletePages,
  type GetPagesData,
  getPage,
  getPages,
  type Page,
  type UpdatePageData,
  updatePage,
} from '~/api.gen';
import { zPage } from '~/api.gen/zod.gen';
import {
  baseInfiniteQueryOptions,
  createEntityKeys,
  createOptimisticEntity,
  findEntityInListCache,
  invalidateIfLastMutation,
  registerEntityQueryKeys,
  useMutateQueryData,
} from '~/query/basic';
import { addMutationRegistrar } from '~/query/mutation-registry';
import { createStxForCreate, createStxForDelete, createStxForUpdate, squashPendingMutation } from '~/query/offline';
import { queryClient } from '~/query/query-client';
import { createResourceError } from '~/utils/resource-error';

type CreatePageItem = CreatePagesData['body'][number];
type CreatePageInput = Omit<CreatePageItem, 'stx'>;
type UpdatePageItem = UpdatePageData['body'];
type UpdatePageInput = Omit<UpdatePageItem, 'stx'>;
type UpdatePageVars = { id: string; key: UpdatePageInput['key']; data: UpdatePageInput['data'] };

export const pagesLimit = appConfig.requestLimits.pages;

type PageFilters = Omit<GetPagesData['query'], 'limit' | 'offset'>;

const keys = createEntityKeys<PageFilters>('page');
registerEntityQueryKeys('page', keys);
export const pageQueryKeys = keys;

const pagesMutationKeyBase = ['page'] as const;
const handleError = createResourceError('page');

// --- Query options ---

export const findPageInListCache = (id: string) => findEntityInListCache<Page>('page', id);

export const findPageInCache = (id: string): Page | undefined => {
  const detail = queryClient.getQueryData<Page>(keys.detail.byId(id));
  if (detail) return detail;
  return findEntityInListCache<Page>('page', id);
};

/** Uses initialData from list cache for instant loading while revalidating. */
export const pageQueryOptions = (id: string) =>
  queryOptions({
    queryKey: keys.detail.byId(id),
    queryFn: async () => {
      const result = await getPage({ path: { id } });
      return result;
    },
    initialData: () => findPageInListCache(id),
  });

type PagesListParams = Omit<NonNullable<GetPagesData['query']>, 'limit' | 'offset'> & {
  limit?: number;
};

export const pagesListQueryOptions = (params: PagesListParams = {}) => {
  const { q = '', sort = 'createdAt', order = 'desc', limit: baseLimit = pagesLimit } = params;

  const limit = String(baseLimit);
  const keyFilters = { q, sort, order };
  const queryKey = keys.list.filtered(keyFilters);
  const baseQuery = { ...keyFilters, limit };

  return infiniteQueryOptions({
    queryKey,
    staleTime: 1000 * 30, // 30 seconds - explicit to ensure route prefetch respects it
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset ?? (page ?? 0) * Number(limit));

      const result = await getPages({
        query: { ...baseQuery, offset },
        signal,
      });

      return result;
    },
    ...baseInfiniteQueryOptions,
  });
};

// --- Mutations ---

export const usePageCreateMutation = () => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation({
    mutationKey: keys.create,
    scope: { id: 'page' },
    // API accepts array — wrap single item, extract first from response
    mutationFn: async (data: CreatePageInput) => {
      const stx = createStxForCreate();
      const result = await createPages({ path: { tenantId: 'public' }, body: [{ ...data, stx }] });
      return result.data[0];
    },
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: keys.list.base });
      const optimisticPage = createOptimisticEntity(zPage, newData);
      mutateCache.create([optimisticPage]);
      return { optimisticPage };
    },
    onError: (_err, _newData, context) => {
      handleError('create');
      if (context?.optimisticPage) mutateCache.remove([context.optimisticPage]);
    },
    onSuccess: (createdPage, _variables, context) => {
      if (context?.optimisticPage) mutateCache.remove([context.optimisticPage]);
      // Upsert to avoid duplicates from concurrent SSE + onSuccess race
      if (findPageInCache(createdPage.id)) mutateCache.update([createdPage]);
      else mutateCache.create([createdPage]);
    },
    // Error-only: onSuccess patches cache, SSE handles other users
    onSettled: (_data, error) => {
      if (error) invalidateIfLastMutation(queryClient, pagesMutationKeyBase, keys.list.base);
    },
  });
};

export const usePageUpdateMutation = () => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation({
    mutationKey: keys.update,
    scope: { id: 'page' },
    mutationFn: async ({ id, key, data }: UpdatePageVars) => {
      const cachedEntity = findPageInListCache(id);
      const stx = createStxForUpdate(cachedEntity);
      return updatePage({ path: { tenantId: 'public', id }, body: { key, data, stx } });
    },
    onMutate: async ({ id, key, data }: UpdatePageVars) => {
      await squashPendingMutation(queryClient, keys.update, id, { [key]: data });
      await queryClient.cancelQueries({ queryKey: keys.list.base });
      await queryClient.cancelQueries({ queryKey: keys.detail.byId(id) });

      const previousPage = findPageInListCache(id);
      if (previousPage) {
        const optimisticPage = { ...previousPage, [key]: data, modifiedAt: new Date().toISOString() };
        mutateCache.update([optimisticPage]);
        queryClient.setQueryData(keys.detail.byId(id), optimisticPage);
      }
      return { previousPage };
    },
    onError: (_err, _variables, context) => {
      handleError('update');
      if (context?.previousPage) {
        mutateCache.update([context.previousPage]);
        queryClient.setQueryData(keys.detail.byId(context.previousPage.id), context.previousPage);
      }
    },
    onSuccess: (updatedPage) => {
      mutateCache.update([updatedPage]);
      queryClient.setQueryData<Page>(keys.detail.byId(updatedPage.id), (old) =>
        old ? { ...old, ...updatedPage } : old,
      );
    },
    // Error-only: onSuccess patches cache, SSE handles other users
    onSettled: (_data, error) => {
      if (error) invalidateIfLastMutation(queryClient, pagesMutationKeyBase, keys.list.base);
    },
  });
};

export const usePageDeleteMutation = () => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation({
    mutationKey: keys.delete,
    scope: { id: 'page' },
    mutationFn: async (pages: Page[]) => {
      const ids = pages.map((p) => p.id);
      const stx = createStxForDelete();
      await deletePages({ path: { tenantId: 'public' }, body: { ids, stx } });
    },
    onMutate: async (pagesToDelete) => {
      await queryClient.cancelQueries({ queryKey: keys.list.base });
      mutateCache.remove(pagesToDelete);
      for (const { id } of pagesToDelete) {
        queryClient.removeQueries({ queryKey: keys.detail.byId(id) });
      }
      return { deletedPages: pagesToDelete };
    },
    onError: (_err, _pages, context) => {
      handleError('delete');
      if (context?.deletedPages) mutateCache.create(context.deletedPages);
    },
    // Error-only: onMutate removed from all caches, SSE handles other users
    onSettled: (_data, error) => {
      if (error) invalidateIfLastMutation(queryClient, pagesMutationKeyBase, keys.list.base);
    },
  });
};

// --- Mutation defaults (offline persistence) ---

addMutationRegistrar((queryClient: QueryClient) => {
  // Detail query defaults for SSE stream handlers
  queryClient.setQueryDefaults(keys.detail.base, {
    queryFn: ({ queryKey }) => getPage({ path: { id: queryKey[2] as string } }),
  });

  queryClient.setMutationDefaults(keys.create, {
    mutationFn: async (data: CreatePageInput) => {
      const stx = createStxForCreate();
      const result = await createPages({ path: { tenantId: 'public' }, body: [{ ...data, stx }] });
      return result.data[0];
    },
  });

  queryClient.setMutationDefaults(keys.update, {
    mutationFn: async ({ id, key, data }: UpdatePageVars) => {
      const cachedEntity = findPageInListCache(id);
      const stx = createStxForUpdate(cachedEntity);
      return updatePage({ path: { tenantId: 'public', id }, body: { key, data, stx } });
    },
  });

  queryClient.setMutationDefaults(keys.delete, {
    mutationFn: async (pages: Page[]) => {
      const ids = pages.map((p) => p.id);
      const stx = createStxForDelete();
      await deletePages({ path: { tenantId: 'public' }, body: { ids, stx } });
    },
  });
});
