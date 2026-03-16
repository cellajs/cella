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
} from '~/query/basic';
import { syncStaleTime } from '~/query/basic/sync-stale-config';
import { useMutateQueryData } from '~/query/basic/use-mutate-query-data';
import { addMutationRegistrar } from '~/query/mutation-registry';
import {
  coalescePendingCreate,
  createStxForCreate,
  createStxForDelete,
  createStxForUpdate,
  squashPendingMutation,
  syncEntityToCache,
} from '~/query/offline';
import { queryClient } from '~/query/query-client';
import { createResourceError } from '~/utils/resource-error';

type CreatePageItem = CreatePagesData['body'][number];
type CreatePageInput = Omit<CreatePageItem, 'stx'>;
type UpdatePageItem = UpdatePageData['body'];
type UpdatePageFields = UpdatePageItem['ops'];
type UpdatePageVars = { id: string; ops: UpdatePageFields };

export const pagesLimit = appConfig.requestLimits.pages;

type PageFilters = Omit<GetPagesData['query'], 'limit' | 'offset'>;

const keys = createEntityKeys<PageFilters>('page');
registerEntityQueryKeys('page', keys, (_orgId, afterSeq) =>
  getPages({ query: { afterSeq: String(afterSeq), limit: '1000' } }),
);
export const pageQueryKeys = keys;

const pagesMutationKeyBase = ['page'] as const;
const handleError = createResourceError('page');

// --- Query options ---

const findPageInListCache = (id: string) => findEntityInListCache<Page>('page', id);

const findPageInCache = (id: string): Page | undefined => {
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
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset ?? (page ?? 0) * Number(limit));

      const result = await getPages({
        query: { ...baseQuery, offset },
        signal,
      });

      return result;
    },
    ...baseInfiniteQueryOptions,
    staleTime: syncStaleTime,
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
    mutationFn: async ({ id, ops }: UpdatePageVars) => {
      const scalarFieldNames = ops ? Object.keys(ops) : [];
      const stx = createStxForUpdate(scalarFieldNames);
      return updatePage({ path: { tenantId: 'public', id }, body: { ops, stx } });
    },
    onMutate: async ({ id, ops }: UpdatePageVars) => {
      // If there's a pending create for this entity, fold update ops into it
      if (coalescePendingCreate(queryClient, keys.create, id, ops as Record<string, unknown>)) {
        return { coalesced: true };
      }

      const mergedOps = squashPendingMutation(queryClient, keys.update, id, ops as Record<string, unknown>);
      await queryClient.cancelQueries({ queryKey: keys.list.base });
      await queryClient.cancelQueries({ queryKey: keys.detail.byId(id) });

      const previousPage = findPageInListCache(id);
      if (previousPage) {
        const optimisticPage = { ...previousPage, ...mergedOps, updatedAt: new Date().toISOString() };
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
    onSuccess: (updatedPage, variables) => {
      const detailKey = keys.detail.byId(updatedPage.id);
      const cached = findPageInListCache(updatedPage.id);
      const mutatedKeys = variables.ops ? Object.keys(variables.ops) : [];
      // Merge only mutated fields + stx from server, preserving other optimistic values
      const serverUpdates: Record<string, unknown> = {};
      for (const key of mutatedKeys) {
        serverUpdates[key] = (updatedPage as Record<string, unknown>)[key];
      }
      const merged = cached
        ? {
            ...cached,
            ...serverUpdates,
            stx: updatedPage.stx,
            updatedAt: updatedPage.updatedAt,
            ...('updatedBy' in updatedPage ? { updatedBy: updatedPage.updatedBy } : {}),
          }
        : updatedPage;
      syncEntityToCache({ entity: merged, detailKey, mutateCache, queryClient });
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
    mutationFn: async ({ id, ops }: UpdatePageVars) => {
      const scalarFieldNames = ops ? Object.keys(ops) : [];
      const stx = createStxForUpdate(scalarFieldNames);
      return updatePage({ path: { tenantId: 'public', id }, body: { ops, stx } });
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
