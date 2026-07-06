import {
  infiniteQueryOptions,
  type QueryClient,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
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
} from 'sdk';
import { zPage } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import { getEdgeOrder } from 'shared/display-order';
import { registerYjsOwnedFields } from '~/modules/common/blocknote/yjs-editor';
import {
  baseInfiniteQueryOptions,
  createCacheFinder,
  createEntityKeys,
  createOptimisticEntity,
  fetchAllPages,
  invalidateIfLastMutation,
  registerEntityQueryKeys,
  removePendingMutations,
  SYNC_CHUNK_SIZE,
} from '~/query/basic';
import { cacheCreate, cacheRemove, cacheUpdate } from '~/query/basic/cache-mutations';
import { syncStaleTime } from '~/query/basic/sync-stale-config';
import { addMutationRegistrar } from '~/query/mutation-registry';
import {
  coalescePendingCreate,
  createStxForCreate,
  createStxForDelete,
  createStxForUpdate,
  mergeServerResponse,
  squashPendingMutation,
  syncEntityToCache,
} from '~/query/offline';
import { createResourceError } from '~/utils/resource-error';

type CreatePageItem = CreatePagesData['body'][number];
type CreatePageInput = Omit<CreatePageItem, 'stx'>;
type UpdatePageItem = UpdatePageData['body'];
type UpdatePageFields = UpdatePageItem['ops'];
type UpdatePageVars = { id: string; ops: UpdatePageFields };

export const pagesLimit = appConfig.requestLimits.pages;

type PageFilters = Omit<GetPagesData['query'], 'limit' | 'offset'>;

const keys = createEntityKeys<PageFilters>('page');
registerEntityQueryKeys('page', keys, (_organizationId, _tenantId, seqCursor, options) =>
  getPages({
    query: { seqCursor, limit: String(SYNC_CHUNK_SIZE) },
    headers: options?.cacheToken ? { 'x-cache-token': options.cacheToken } : undefined,
  }),
);

// Register Yjs-owned fields — SSE updates will skip these while a Yjs editor is active
registerYjsOwnedFields('page', ['description', 'summary', 'summaryLength']);
export const pageQueryKeys = keys;

const pagesMutationKeyBase = ['page'] as const;
const handleError = createResourceError('page');

// --- Query options ---

const findPageInCache = createCacheFinder<Page>('page');

/** Uses initialData from list cache for instant loading while revalidating. */
export const pageQueryOptions = (id: string) =>
  queryOptions({
    queryKey: keys.detail.byId(id),
    queryFn: async () => {
      const result = await getPage({ path: { id } });
      return result;
    },
    initialData: () => findPageInCache(id),
  });

/**
 * Canonical page query — one flat query for all user pages.
 * Stored at keys.list.base (['page', 'list']).
 * Consumers derive views via select() or client-side filtering.
 * Sync (SSE + delta fetch) keeps this fresh; staleTime follows sync liveness.
 */
export const pagesCanonicalOptions = () => {
  return queryOptions({
    queryKey: keys.list.base,
    queryFn: async () => {
      return fetchAllPages(
        ({ limit, offset }) =>
          getPages({
            query: { limit, offset },
          }),
        pagesLimit,
      );
    },
    staleTime: syncStaleTime,
  });
};

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
    meta: { persist: false },
    staleTime: syncStaleTime,
  });
};

// --- Mutations ---

export const usePageCreateMutation = () => {
  const queryClient = useQueryClient();
  const listKey = keys.list.base;

  return useMutation({
    mutationKey: keys.create,
    scope: { id: 'page' },
    // API accepts array — wrap single item, extract first from response
    mutationFn: async (data: CreatePageInput & { displayOrder?: number }) => {
      const stx = createStxForCreate();
      const result = await createPages({ body: [{ ...data, stx }] });
      return result.data[0];
    },
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: listKey });

      // Compute displayOrder client-side for offline support: read existing
      // top-level pages from the canonical cache and place the new page at the
      // visual top (lowest order in this ascending list).
      if (newData.displayOrder === undefined) {
        const canonical = queryClient.getQueryData<{ items: Page[] }>(listKey);
        const topLevelOrders = (canonical?.items ?? []).filter((p) => p.parentId === null).map((p) => p.displayOrder);
        newData.displayOrder = getEdgeOrder(topLevelOrders, 'top', true);
      }

      const optimisticPage = createOptimisticEntity(zPage, newData);
      cacheCreate(listKey, [optimisticPage]);
      return { optimisticPage };
    },
    meta: { suppressGlobalErrorToast: true },
    onError: (_err, _newData, context) => {
      handleError('create');
      if (context?.optimisticPage) cacheRemove(listKey, [context.optimisticPage]);
    },
    onSuccess: (createdPage, _variables, context) => {
      if (context?.optimisticPage) cacheRemove(listKey, [context.optimisticPage]);
      // Upsert to avoid duplicates from concurrent SSE + onSuccess race
      if (findPageInCache(createdPage.id)) cacheUpdate(listKey, [createdPage]);
      else cacheCreate(listKey, [createdPage]);
    },
    // Error-only: onSuccess patches cache, SSE handles other users
    onSettled: (_data, error) => {
      if (error) invalidateIfLastMutation(queryClient, pagesMutationKeyBase, listKey);
    },
  });
};

export const usePageUpdateMutation = () => {
  const queryClient = useQueryClient();
  const listKey = keys.list.base;

  return useMutation({
    mutationKey: keys.update,
    mutationFn: async ({ id, ops }: UpdatePageVars) => {
      const scalarFieldNames = ops ? Object.keys(ops) : [];
      const stx = createStxForUpdate(scalarFieldNames);
      return updatePage({ path: { id }, body: { ops, stx } });
    },
    onMutate: async ({ id, ops }: UpdatePageVars) => {
      // If there's a pending create for this entity, fold update ops into it
      if (coalescePendingCreate(queryClient, keys.create, id, ops as Record<string, unknown>)) {
        return { coalesced: true };
      }

      const mergedOps = squashPendingMutation(queryClient, keys.update, id, ops as Record<string, unknown>);
      await queryClient.cancelQueries({ queryKey: listKey });
      await queryClient.cancelQueries({ queryKey: keys.detail.byId(id) });

      const previousPage = findPageInCache(id);
      if (previousPage) {
        const optimisticPage = { ...previousPage, ...mergedOps, updatedAt: new Date().toISOString() };
        cacheUpdate(listKey, [optimisticPage]);
        queryClient.setQueryData(keys.detail.byId(id), optimisticPage);
      }
      return { previousPage };
    },
    meta: { suppressGlobalErrorToast: true },
    onError: (_err, _variables, context) => {
      handleError('update');
      if (context?.previousPage) {
        cacheUpdate(listKey, [context.previousPage]);
        queryClient.setQueryData(keys.detail.byId(context.previousPage.id), context.previousPage);
      }
    },
    onSuccess: (updatedPage, variables) => {
      const detailKey = keys.detail.byId(updatedPage.id);
      const cached = findPageInCache(updatedPage.id);
      const mutatedKeys = variables.ops ? Object.keys(variables.ops) : [];
      const merged = mergeServerResponse({ cached, serverEntity: updatedPage, mutatedKeys });
      syncEntityToCache({ entity: merged, listKey, detailKey, queryClient });
    },
    // Error-only: onSuccess patches cache, SSE handles other users
    onSettled: (_data, error) => {
      if (error) invalidateIfLastMutation(queryClient, pagesMutationKeyBase, listKey);
    },
  });
};

export const usePageDeleteMutation = () => {
  const queryClient = useQueryClient();
  const listKey = keys.list.base;

  return useMutation({
    mutationKey: keys.delete,
    scope: { id: 'page' },
    mutationFn: async (pages: Page[]) => {
      const ids = pages.map((p) => p.id);
      const stx = createStxForDelete();
      await deletePages({ body: { ids, stx } });
    },
    onMutate: async (pagesToDelete) => {
      removePendingMutations(
        queryClient,
        keys.update,
        pagesToDelete.map((p) => p.id),
      );
      await queryClient.cancelQueries({ queryKey: listKey });
      cacheRemove(listKey, pagesToDelete);
      for (const { id } of pagesToDelete) {
        queryClient.removeQueries({ queryKey: keys.detail.byId(id) });
      }
      return { deletedPages: pagesToDelete };
    },
    meta: { suppressGlobalErrorToast: true },
    onError: (_err, _pages, context) => {
      handleError('delete');
      if (context?.deletedPages) cacheCreate(listKey, context.deletedPages);
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
      const result = await createPages({ body: [{ ...data, stx }] });
      return result.data[0];
    },
  });

  queryClient.setMutationDefaults(keys.update, {
    mutationFn: async ({ id, ops }: UpdatePageVars) => {
      const scalarFieldNames = ops ? Object.keys(ops) : [];
      const stx = createStxForUpdate(scalarFieldNames);
      return updatePage({ path: { id }, body: { ops, stx } });
    },
  });

  queryClient.setMutationDefaults(keys.delete, {
    mutationFn: async (pages: Page[]) => {
      const ids = pages.map((p) => p.id);
      const stx = createStxForDelete();
      await deletePages({ body: { ids, stx } });
    },
  });
});

/** Fetch pages for table export. Bypasses cache; returns flat items. */
export const fetchPagesForExport = async (params: { limit: number; offset?: number; q?: string }) => {
  const { limit, offset = 0, q = '' } = params;
  const response = await getPages({ query: { limit: String(limit), q, offset: String(offset) } });
  return response.items;
};
