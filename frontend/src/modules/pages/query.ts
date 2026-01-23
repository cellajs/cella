import {
  infiniteQueryOptions,
  type QueryClient,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
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
import { zPage, zUpdatePageData } from '~/api.gen/zod.gen';
import {
  baseInfiniteQueryOptions,
  createEntityKeys,
  createOptimisticEntity,
  findInListCache,
  invalidateIfLastMutation,
  useMutateQueryData,
} from '~/query/basic';
import { addMutationRegistrar } from '~/query/mutation-registry';
import { createTxForCreate, createTxForUpdate, squashPendingMutation, updateFieldTransactions } from '~/query/offline';

// Use generated types from api.gen for mutation input shapes
type CreatePageInput = CreatePageData['body']['data'];
type UpdatePageInput = UpdatePageData['body']['data'];

/** All updatable fields extracted from generated zod schema - used for conflict detection. */
const pageTrackedFields = zUpdatePageData.shape.body.shape.data.keyof().options;

export const pagesLimit = appConfig.requestLimits.pages;

type PageFilters = Omit<GetPagesData['query'], 'limit' | 'offset'>;

// ═══════════════════════════════════════════════════════════════════════════
// Page query keys
// ═══════════════════════════════════════════════════════════════════════════

// Use factory for consistent query keys across detail and list queries
const keys = createEntityKeys<PageFilters>('page');

export const pageQueryKeys = keys;

/** Base mutation key for all page mutations - used for over-invalidation prevention. */
const pagesMutationKeyBase = ['page'] as const;

// ═══════════════════════════════════════════════════════════════════════════
// Query options
// ═══════════════════════════════════════════════════════════════════════════

/** Find a page in the list cache by id. */
export const findPageInListCache = (id: string) => findInListCache<Page>(keys.list.base, id);

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

// ═══════════════════════════════════════════════════════════════════════════
// Mutation hooks - standard React Query with sync utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Custom hook to create a new page with optimistic updates.
 * Uses sync utilities for transaction metadata.
 */
export const usePageCreateMutation = () => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation({
    mutationKey: keys.create,

    // Execute API call with transaction metadata for conflict tracking
    mutationFn: async (data: CreatePageInput) => {
      const tx = createTxForCreate();
      const result = await createPage({ body: { data, tx } });
      return result;
    },

    // Runs BEFORE mutationFn - prepare optimistic state
    onMutate: async (newData) => {
      // Cancel in-flight queries to prevent race conditions with stale data
      await queryClient.cancelQueries({ queryKey: keys.list.base });

      // Build optimistic entity from schema (auto-generates temp ID, timestamps, user refs)
      const optimisticPage = createOptimisticEntity(zPage, newData);

      // Insert optimistic entity into list cache for instant UI update
      mutateCache.create([optimisticPage]);

      // Return context for rollback/replacement in later callbacks
      return { optimisticPage };
    },

    // Runs on API failure - rollback optimistic changes
    onError: (_err, _newData, context) => {
      // Remove the optimistic entity we added in onMutate
      if (context?.optimisticPage) {
        mutateCache.remove([context.optimisticPage]);
      }
    },

    // Runs on API success - finalize with real data
    onSuccess: (result, _variables, context) => {
      // Remove temp entity and insert real one with server-assigned ID
      if (context?.optimisticPage) {
        mutateCache.remove([context.optimisticPage]);
      }
      mutateCache.create([result.data]);

      // Store server timestamps for future conflict detection
      updateFieldTransactions('page', result.data.id, result.tx);
    },

    // Runs after success OR error - ensure cache stays fresh
    onSettled: () => {
      // Skip invalidation if other page mutations still in flight (prevents over-invalidation)
      invalidateIfLastMutation(queryClient, pagesMutationKeyBase, keys.list.base);
    },
  });
};

/**
 * Custom hook to update an existing page with optimistic updates.
 * Implements squashing: cancels pending same-field mutations.
 */
export const usePageUpdateMutation = () => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation({
    mutationKey: keys.update,

    // Execute API call with field-level transaction metadata
    mutationFn: async ({ id, data }: { id: string; data: UpdatePageInput }) => {
      // Build tx with HLC timestamp + field tracking for server-side conflict detection
      const tx = createTxForUpdate('page', id, data, pageTrackedFields);
      const result = await updatePage({ path: { id }, body: { data, tx } });
      return result;
    },

    // Runs BEFORE mutationFn - squash duplicates and prepare optimistic state
    onMutate: async ({ id, data }) => {
      // Cancel in-flight mutations updating the same fields (prevents redundant requests)
      await squashPendingMutation(queryClient, keys.update, id, data, pageTrackedFields);

      // Cancel queries to prevent race conditions
      await queryClient.cancelQueries({ queryKey: keys.list.base });

      // Snapshot current state for potential rollback
      const previousPage = findPageInListCache(id);

      if (previousPage) {
        // Merge new data into existing entity for instant UI update
        const optimisticPage = { ...previousPage, ...data, modifiedAt: new Date().toISOString() };
        mutateCache.update([optimisticPage]);
      }

      // Return snapshot for rollback in onError
      return { previousPage };
    },

    // Runs on API failure - restore previous state
    onError: (_err, _variables, context) => {
      // Revert cache to pre-mutation snapshot
      if (context?.previousPage) {
        mutateCache.update([context.previousPage]);
      }
    },

    // Runs on API success - apply authoritative server data
    onSuccess: (result) => {
      // Replace optimistic data with server response (source of truth)
      mutateCache.update([result.data]);

      // Store server timestamps for future conflict detection
      updateFieldTransactions('page', result.data.id, result.tx);
    },

    // Runs after success OR error - refresh detail view
    onSettled: (_data, _error, { id }) => {
      // Skip invalidation if other page mutations still in flight
      invalidateIfLastMutation(queryClient, pagesMutationKeyBase, keys.detail.byId(id));
    },
  });
};

/**
 * Custom hook to delete pages with optimistic updates.
 * Accepts array of pages for batch delete compatibility.
 */
export const usePageDeleteMutation = () => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation({
    mutationKey: keys.delete,

    // Execute batch delete API call
    mutationFn: async (pages: Page[]) => {
      const ids = pages.map((p) => p.id);
      await deletePages({ body: { ids } });
    },

    // Runs BEFORE mutationFn - remove items immediately from UI
    onMutate: async (pagesToDelete) => {
      // Cancel queries to prevent race conditions
      await queryClient.cancelQueries({ queryKey: keys.list.base });

      // Remove from cache for instant UI feedback
      mutateCache.remove(pagesToDelete);

      // Store deleted items for potential restoration
      return { deletedPages: pagesToDelete };
    },

    // Runs on API failure - restore deleted items
    onError: (_err, _pages, context) => {
      // Re-add items that failed to delete on server
      if (context?.deletedPages) {
        mutateCache.create(context.deletedPages);
      }
    },

    // Runs after success OR error - ensure cache stays fresh
    onSettled: () => {
      // Skip invalidation if other page mutations still in flight (prevents over-invalidation)
      invalidateIfLastMutation(queryClient, pagesMutationKeyBase, keys.list.base);
    },
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// Mutation defaults registration (for offline persistence)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Register mutation defaults for pages.
 * This enables mutations to resume after page reload by providing mutationFn globally.
 * Called during app initialization before persisted cache restoration.
 */
addMutationRegistrar((queryClient: QueryClient) => {
  // Create mutation
  queryClient.setMutationDefaults(keys.create, {
    mutationFn: async (data: CreatePageInput) => {
      const tx = createTxForCreate();
      return createPage({ body: { data, tx } });
    },
  });

  // Update mutation
  queryClient.setMutationDefaults(keys.update, {
    mutationFn: async ({ id, data }: { id: string; data: UpdatePageInput }) => {
      const tx = createTxForUpdate('page', id, data, pageTrackedFields);
      return updatePage({ path: { id }, body: { data, tx } });
    },
  });

  // Delete mutation
  queryClient.setMutationDefaults(keys.delete, {
    mutationFn: async (pages: Page[]) => {
      const ids = pages.map((p) => p.id);
      await deletePages({ body: { ids } });
    },
  });
});
