import {
  infiniteQueryOptions,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { appConfig } from 'config';
import {
  type Attachment,
  type CreateAttachmentsData,
  createAttachments,
  deleteAttachments,
  type GetAttachmentsData,
  getAttachment,
  getAttachments,
  type UpdateAttachmentData,
  updateAttachment,
} from '~/api.gen';
import { zAttachment } from '~/api.gen/zod.gen';
import {
  baseInfiniteQueryOptions,
  createEntityKeys,
  findInListCache,
  getSchemaDefaults,
  invalidateIfLastMutation,
  registerEntityQueryKeys,
  useMutateQueryData,
} from '~/query/basic';
import { addMutationRegistrar } from '~/query/mutation-registry';
import { createTxForCreate, createTxForDelete, createTxForUpdate, squashPendingMutation } from '~/query/offline';
import { getCacheToken } from '~/query/realtime';

// Use generated types from api.gen for mutation input shapes
// Body is array of items with tx embedded, so extract element type without tx
type CreateAttachmentItem = CreateAttachmentsData['body'][number];
type CreateAttachmentInput = Omit<CreateAttachmentItem, 'tx'>[];
type UpdateAttachmentItem = UpdateAttachmentData['body'];
type UpdateAttachmentInput = Omit<UpdateAttachmentItem, 'tx'>;

export const attachmentsLimit = appConfig.requestLimits.attachments;

type AttachmentFilters = Omit<GetAttachmentsData['query'], 'limit' | 'offset'> & {
  orgId: string;
};

const keys = createEntityKeys<AttachmentFilters>('attachment');

// Register query keys for dynamic lookup in stream handlers
registerEntityQueryKeys('attachment', keys);

/**
 * Attachment query keys.
 */
export const attachmentQueryKeys = keys;

/** Base mutation key for all attachment mutations - used for over-invalidation prevention. */
const attachmentsMutationKeyBase = ['attachment'] as const;

type AttachmentsListParams = Omit<NonNullable<GetAttachmentsData['query']>, 'limit' | 'offset'> & {
  orgId: string;
  limit?: number;
};

/**
 * Infinite query options to get a paginated list of attachments for an organization.
 */
export const attachmentsListQueryOptions = (params: AttachmentsListParams) => {
  const { orgId, q = '', sort = 'createdAt', order = 'desc', limit: baseLimit = attachmentsLimit } = params;

  const limit = String(baseLimit);
  const keyFilters = { orgId, q, sort, order };
  const queryKey = keys.list.filtered(keyFilters);
  const baseQuery = { q, sort, order, limit };

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset ?? (page ?? 0) * Number(limit));

      const result = await getAttachments({
        path: { orgId },
        query: { ...baseQuery, offset },
        signal,
      });

      return result;
    },
    ...baseInfiniteQueryOptions,
  });
};

/**
 * Query options to get a single attachment by ID.
 * Uses cache token from SSE notification for efficient server-side cache hit.
 *
 * @param orgId - Organization ID
 * @param id - Attachment ID
 */
export const attachmentQueryOptions = (orgId: string, id: string) => ({
  queryKey: keys.detail.byId(id),
  queryFn: async () => {
    // Check for cache token from SSE notification
    const cacheToken = getCacheToken('attachment', id);

    const result = await getAttachment({
      path: { orgId, id },
      // Pass cache token header for server-side cache hit
      headers: cacheToken ? { 'X-Cache-Token': cacheToken } : undefined,
    });

    return result;
  },
  // Use list cache as initial data for instant display
  initialData: () => findAttachmentInListCache(id),
});

/** Find an attachment in the list cache by id. */
export const findAttachmentInListCache = (id: string) => findInListCache<Attachment>(keys.list.base, id);

/**
 * Reactive hook to get all attachments with a specific groupId.
 * Subscribes to the attachments list query and filters by groupId.
 * Returns null if no groupId provided or no matches found.
 */
export function useGroupAttachments(orgId: string | undefined, groupId: string | undefined) {
  const queryOptions = orgId ? attachmentsListQueryOptions({ orgId, sort: 'createdAt', order: 'desc' }) : null;

  const { data } = useInfiniteQuery({
    ...queryOptions!,
    enabled: !!orgId && !!groupId,
    select: (data) => {
      if (!groupId) return null;
      const allItems = data.pages.flatMap((page) => page.items);
      const filtered = allItems.filter((item) => item.groupId === groupId);
      return filtered.length > 0 ? filtered : null;
    },
  });

  return data ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Mutation hooks - standard React Query with sync utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Custom hook to create one or more attachments with optimistic updates.
 * Uses sync utilities for transaction metadata.
 */
export const useAttachmentCreateMutation = (orgId: string) => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation({
    mutationKey: keys.create,

    // Execute API call with transaction metadata for conflict tracking
    mutationFn: async (data: CreateAttachmentInput) => {
      const tx = createTxForCreate();
      // Body is array with tx embedded in each item
      const body = data.map((item) => ({ ...item, tx }));
      const result = await createAttachments({ path: { orgId }, body });
      return result;
    },

    // Runs BEFORE mutationFn - prepare optimistic state
    onMutate: async (newAttachments) => {
      // Cancel in-flight queries to prevent race conditions with stale data
      await queryClient.cancelQueries({ queryKey: keys.list.base });

      // Build optimistic attachments using schema defaults + input data
      // Note: Attachments already have IDs from Transloadit, so we preserve them
      const schemaDefaults = getSchemaDefaults(zAttachment);
      const optimisticAttachments = newAttachments.map((att) => ({
        ...schemaDefaults,
        ...att,
        createdAt: new Date().toISOString(),
        modifiedAt: null,
        modifiedBy: null,
      })) as Attachment[];

      // Insert optimistic entities into list cache for instant UI update
      mutateCache.create(optimisticAttachments);

      // Return context for rollback/replacement in later callbacks
      return { optimisticAttachments };
    },

    // Runs on API failure - rollback optimistic changes
    onError: (_err, _newData, context) => {
      // Remove the optimistic entities we added in onMutate
      if (context?.optimisticAttachments) {
        mutateCache.remove(context.optimisticAttachments);
      }
    },

    // Runs on API success - finalize with real data
    onSuccess: (result, _variables, context) => {
      // Remove temp entities and insert real ones with server data
      if (context?.optimisticAttachments) {
        mutateCache.remove(context.optimisticAttachments);
      }
      mutateCache.create(result.data);
    },

    // Runs after success OR error - ensure cache stays fresh
    onSettled: () => {
      // Skip invalidation if other attachment mutations still in flight (prevents over-invalidation)
      invalidateIfLastMutation(queryClient, attachmentsMutationKeyBase, keys.list.base);
    },
  });
};

/**
 * Custom hook to update an existing attachment with optimistic updates.
 * Implements squashing: cancels pending same-field mutations.
 */
export const useAttachmentUpdateMutation = (orgId: string) => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation({
    mutationKey: keys.update,

    // Execute API call with version-based transaction metadata
    mutationFn: async ({ id, data }: { id: string; data: UpdateAttachmentInput }) => {
      // Get cached entity for baseVersion conflict detection
      const cachedEntity = findAttachmentInListCache(id);
      const tx = createTxForUpdate(cachedEntity);
      // Body has tx embedded directly
      const result = await updateAttachment({ path: { orgId, id }, body: { ...data, tx } });
      return result;
    },

    // Runs BEFORE mutationFn - squash duplicates and prepare optimistic state
    onMutate: async ({ id, data }) => {
      // Cancel in-flight mutations updating the same entity (prevents redundant requests)
      await squashPendingMutation(queryClient, keys.update, id, data);

      // Cancel queries to prevent race conditions
      await queryClient.cancelQueries({ queryKey: keys.list.base });

      // Snapshot current state for potential rollback
      const previousAttachment = findAttachmentInListCache(id);

      if (previousAttachment) {
        // Merge new data into existing entity for instant UI update
        const optimisticAttachment = { ...previousAttachment, ...data, modifiedAt: new Date().toISOString() };
        mutateCache.update([optimisticAttachment]);
      }

      // Return snapshot for rollback in onError
      return { previousAttachment };
    },

    // Runs on API failure - restore previous state
    onError: (_err, _variables, context) => {
      // Revert cache to pre-mutation snapshot
      if (context?.previousAttachment) {
        mutateCache.update([context.previousAttachment]);
      }
    },

    // Runs on API success - apply authoritative server data
    onSuccess: (updatedAttachment) => {
      // Replace optimistic data with server response (source of truth)
      mutateCache.update([updatedAttachment]);
    },

    // Runs after success OR error - refresh queries
    onSettled: () => {
      // Skip invalidation if other attachment mutations still in flight (prevents over-invalidation)
      invalidateIfLastMutation(queryClient, attachmentsMutationKeyBase, keys.list.base);
    },
  });
};

/**
 * Custom hook to delete attachments with optimistic updates.
 * Accepts array of attachments for batch delete compatibility.
 */
export const useAttachmentDeleteMutation = (orgId: string) => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation({
    mutationKey: keys.delete,

    // Execute batch delete API call with tx for echo prevention
    mutationFn: async (attachments: Attachment[]) => {
      const ids = attachments.map((a) => a.id);
      const tx = createTxForDelete();
      await deleteAttachments({ path: { orgId }, body: { ids, tx } });
    },

    // Runs BEFORE mutationFn - remove items immediately from UI
    onMutate: async (attachmentsToDelete) => {
      // Cancel queries to prevent race conditions
      await queryClient.cancelQueries({ queryKey: keys.list.base });

      // Remove from cache for instant UI feedback
      mutateCache.remove(attachmentsToDelete);

      // Store deleted items for potential restoration
      return { deletedAttachments: attachmentsToDelete };
    },

    // Runs on API failure - restore deleted items
    onError: (_err, _attachments, context) => {
      // Re-add items that failed to delete on server
      if (context?.deletedAttachments) {
        mutateCache.create(context.deletedAttachments);
      }
    },

    // Runs after success OR error - ensure cache stays fresh
    onSettled: () => {
      // Skip invalidation if other attachment mutations still in flight (prevents over-invalidation)
      invalidateIfLastMutation(queryClient, attachmentsMutationKeyBase, keys.list.base);
    },
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// Mutation defaults registration (for offline persistence)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Register mutation defaults for attachments.
 * NOTE: Attachment mutations require orgId which must be included in mutation variables
 * for persistence to work. The hooks wrap this internally.
 */
addMutationRegistrar((queryClient: QueryClient) => {
  // Create mutation - variables include orgId for persistence
  queryClient.setMutationDefaults(keys.create, {
    mutationFn: async ({ orgId, data }: { orgId: string; data: CreateAttachmentInput }) => {
      const tx = createTxForCreate();
      // Body is array with tx embedded in each item
      const body = data.map((item) => ({ ...item, tx }));
      return createAttachments({ path: { orgId }, body });
    },
  });

  // Update mutation - variables include orgId for persistence
  queryClient.setMutationDefaults(keys.update, {
    mutationFn: async ({ orgId, id, data }: { orgId: string; id: string; data: UpdateAttachmentInput }) => {
      // Get cached entity for baseVersion (may be undefined if not in cache)
      const cachedEntity = findAttachmentInListCache(id);
      const tx = createTxForUpdate(cachedEntity);
      // Body has tx embedded directly
      return updateAttachment({ path: { orgId, id }, body: { ...data, tx } });
    },
  });

  // Delete mutation - variables include orgId for persistence
  queryClient.setMutationDefaults(keys.delete, {
    mutationFn: async ({ orgId, attachments }: { orgId: string; attachments: Attachment[] }) => {
      const ids = attachments.map((a) => a.id);
      await deleteAttachments({ path: { orgId }, body: { ids } });
    },
  });
});
