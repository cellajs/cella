import { infiniteQueryOptions, type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { appConfig } from 'config';
import {
  type Attachment,
  type CreateAttachmentsData,
  createAttachments,
  deleteAttachments,
  type GetAttachmentsData,
  getAttachments,
  type UpdateAttachmentData,
  updateAttachment,
} from '~/api.gen';
import {
  baseInfiniteQueryOptions,
  createEntityKeys,
  findInListCache,
  invalidateIfLastMutation,
  registerEntityQueryKeys,
  useMutateQueryData,
} from '~/query/basic';
import { addMutationRegistrar } from '~/query/mutation-registry';
import { createTxForCreate, createTxForUpdate, squashPendingMutation } from '~/query/offline';

// Use generated types from api.gen for mutation input shapes
// Body is array of items with tx embedded, so extract element type without tx
type CreateAttachmentItem = CreateAttachmentsData['body'][number];
type CreateAttachmentInput = Omit<CreateAttachmentItem, 'tx'>[];
type UpdateAttachmentItem = UpdateAttachmentData['body'];
type UpdateAttachmentInput = Omit<UpdateAttachmentItem, 'tx'>;

export const attachmentsLimit = appConfig.requestLimits.attachments;

type AttachmentFilters = Omit<GetAttachmentsData['query'], 'limit' | 'offset'> & {
  orgIdOrSlug: string;
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
  orgIdOrSlug: string;
  limit?: number;
};

/**
 * Infinite query options to get a paginated list of attachments for an organization.
 */
export const attachmentsQueryOptions = (params: AttachmentsListParams) => {
  const { orgIdOrSlug, q = '', sort = 'createdAt', order = 'desc', limit: baseLimit = attachmentsLimit } = params;

  const limit = String(baseLimit);
  const keyFilters = { orgIdOrSlug, q, sort, order };
  const queryKey = keys.list.filtered(keyFilters);
  const baseQuery = { q, sort, order, limit };

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset ?? (page ?? 0) * Number(limit));

      const result = await getAttachments({
        path: { orgIdOrSlug },
        query: { ...baseQuery, offset },
        signal,
      });

      return result;
    },
    ...baseInfiniteQueryOptions,
  });
};

/** Find an attachment in the list cache by id. */
export const findAttachmentInListCache = (id: string) => findInListCache<Attachment>(keys.list.base, id);

// ═══════════════════════════════════════════════════════════════════════════
// Mutation hooks - standard React Query with sync utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Custom hook to create one or more attachments with optimistic updates.
 * Uses sync utilities for transaction metadata.
 */
export const useAttachmentCreateMutation = (orgIdOrSlug: string) => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation({
    mutationKey: keys.create,

    // Execute API call with transaction metadata for conflict tracking
    mutationFn: async (data: CreateAttachmentInput) => {
      const tx = createTxForCreate();
      // Body is array with tx embedded in each item
      const body = data.map((item) => ({ ...item, tx }));
      const result = await createAttachments({ path: { orgIdOrSlug }, body });
      return result;
    },

    // Runs BEFORE mutationFn - prepare optimistic state
    onMutate: async (newAttachments) => {
      // Cancel in-flight queries to prevent race conditions with stale data
      await queryClient.cancelQueries({ queryKey: keys.list.base });

      // Placeholder tx for optimistic updates (replaced by real tx from server)
      const placeholderTx = { id: '', sourceId: '', version: 0, fieldVersions: {} };

      // TODO use createOptimisticEntity?
      // Build optimistic attachments (they already have IDs from Transloadit)
      const optimisticAttachments = newAttachments.map((att) => ({
        ...att,
        entityType: 'attachment' as const,
        createdAt: new Date().toISOString(),
        modifiedAt: null,
        modifiedBy: null,
        description: '',
        keywords: '',
        url: '',
        thumbnailUrl: null,
        tx: placeholderTx,
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
export const useAttachmentUpdateMutation = (orgIdOrSlug: string) => {
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
      const result = await updateAttachment({ path: { orgIdOrSlug, id }, body: { ...data, tx } });
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
export const useAttachmentDeleteMutation = (orgIdOrSlug: string) => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation({
    mutationKey: keys.delete,

    // Execute batch delete API call
    mutationFn: async (attachments: Attachment[]) => {
      const ids = attachments.map((a) => a.id);
      await deleteAttachments({ path: { orgIdOrSlug }, body: { ids } });
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
 * NOTE: Attachment mutations require orgIdOrSlug which must be included in mutation variables
 * for persistence to work. The hooks wrap this internally.
 */
addMutationRegistrar((queryClient: QueryClient) => {
  // Create mutation - variables include orgIdOrSlug for persistence
  queryClient.setMutationDefaults(keys.create, {
    mutationFn: async ({ orgIdOrSlug, data }: { orgIdOrSlug: string; data: CreateAttachmentInput }) => {
      const tx = createTxForCreate();
      // Body is array with tx embedded in each item
      const body = data.map((item) => ({ ...item, tx }));
      return createAttachments({ path: { orgIdOrSlug }, body });
    },
  });

  // Update mutation - variables include orgIdOrSlug for persistence
  queryClient.setMutationDefaults(keys.update, {
    mutationFn: async ({ orgIdOrSlug, id, data }: { orgIdOrSlug: string; id: string; data: UpdateAttachmentInput }) => {
      // Get cached entity for baseVersion (may be undefined if not in cache)
      const cachedEntity = findAttachmentInListCache(id);
      const tx = createTxForUpdate(cachedEntity);
      // Body has tx embedded directly
      return updateAttachment({ path: { orgIdOrSlug, id }, body: { ...data, tx } });
    },
  });

  // Delete mutation - variables include orgIdOrSlug for persistence
  queryClient.setMutationDefaults(keys.delete, {
    mutationFn: async ({ orgIdOrSlug, attachments }: { orgIdOrSlug: string; attachments: Attachment[] }) => {
      const ids = attachments.map((a) => a.id);
      await deleteAttachments({ path: { orgIdOrSlug }, body: { ids } });
    },
  });
});
