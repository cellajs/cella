import { infiniteQueryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { appConfig } from 'config';
import {
  type Attachment,
  type CreateAttachmentData,
  createAttachment,
  deleteAttachments,
  type GetAttachmentsData,
  getAttachments,
  type UpdateAttachmentData,
  updateAttachment,
} from '~/api.gen';
import type { ApiError } from '~/lib/api';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';
import { queryClient } from '~/query/query-client';
import { flattenInfiniteData } from '~/query/utils/flatten';
import { baseInfiniteQueryOptions } from '~/query/utils/infinite-query-options';
import { createEntityKeys } from '../entities/create-query-keys';

export const attachmentsLimit = appConfig.requestLimits.attachments;

type AttachmentFilters = Omit<GetAttachmentsData['query'], 'limit' | 'offset'> & {
  orgIdOrSlug: string;
};

const keys = createEntityKeys<AttachmentFilters>('attachment');

/**
 * Attachment query keys.
 */
export const attachmentQueryKeys = keys;

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

      return getAttachments({
        path: { orgIdOrSlug },
        query: { ...baseQuery, offset },
        signal,
      });
    },
    ...baseInfiniteQueryOptions,
  });
};

/**
 * Find an attachment in the list cache by id.
 * Searches through all cached attachment list queries.
 */
export const findAttachmentInListCache = (id: string): Attachment | undefined => {
  const queries = queryClient.getQueryCache().findAll({ queryKey: keys.list.base });

  for (const query of queries) {
    const items = flattenInfiniteData<Attachment>(query.state.data);
    const found = items.find((att) => att.id === id);
    if (found) return found;
  }

  return undefined;
};

/**
 * Custom hook to create one or more attachments with optimistic updates.
 * New attachments appear immediately in the UI while the server upload is in progress.
 */
export const useAttachmentCreateMutation = (orgIdOrSlug: string) => {
  const qc = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation<Attachment[], ApiError, CreateAttachmentData['body'], { optimisticAttachments: Attachment[] }>({
    mutationKey: keys.create,
    mutationFn: (body) => createAttachment({ path: { orgIdOrSlug }, body }),

    onMutate: async (newAttachments) => {
      // Cancel outgoing refetches
      await qc.cancelQueries({ queryKey: keys.list.base });

      // Create optimistic attachments (they already have server-generated IDs from Transloadit)
      const optimisticAttachments = newAttachments as Attachment[];

      // Add to cache optimistically
      mutateCache.create(optimisticAttachments);

      return { optimisticAttachments };
    },

    onError: (_err, _newAttachments, context) => {
      // Remove the optimistic attachments on error
      if (context?.optimisticAttachments) {
        mutateCache.remove(context.optimisticAttachments);
      }
    },

    onSuccess: (createdAttachments, _variables, context) => {
      // Replace optimistic data with real data from server
      if (context?.optimisticAttachments) {
        mutateCache.remove(context.optimisticAttachments);
      }
      mutateCache.create(createdAttachments);
    },

    onSettled: () => {
      // Always refetch to ensure cache is in sync
      qc.invalidateQueries({ queryKey: keys.list.base });
    },
  });
};

/**
 * Custom hook to update an existing attachment with optimistic updates.
 */
export const useAttachmentUpdateMutation = (orgIdOrSlug: string) => {
  const qc = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation<
    Attachment,
    ApiError,
    { id: string; body: UpdateAttachmentData['body'] },
    { previousAttachment: Attachment | undefined }
  >({
    mutationKey: keys.update,
    mutationFn: ({ id, body }) => updateAttachment({ body, path: { orgIdOrSlug, id } }),

    onMutate: async ({ id, body }) => {
      // Cancel outgoing refetches
      await qc.cancelQueries({ queryKey: keys.list.base });

      // Snapshot previous value
      const previousAttachment = findAttachmentInListCache(id);

      if (previousAttachment) {
        // Optimistically update in cache
        const optimisticAttachment = { ...previousAttachment, ...body, modifiedAt: new Date().toISOString() };
        mutateCache.update([optimisticAttachment]);
      }

      return { previousAttachment };
    },

    onError: (_err, _variables, context) => {
      // Rollback to previous value
      if (context?.previousAttachment) {
        mutateCache.update([context.previousAttachment]);
      }
    },

    onSuccess: (updatedAttachment) => {
      // Update with real data from server
      mutateCache.update([updatedAttachment]);
    },

    onSettled: () => {
      // Refetch to ensure cache is in sync
      qc.invalidateQueries({ queryKey: keys.list.base });
    },
  });
};

/**
 * Custom hook to delete attachments with optimistic updates.
 */
export const useAttachmentDeleteMutation = (orgIdOrSlug: string) => {
  const qc = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation<void, ApiError, Attachment[], { deletedAttachments: Attachment[] }>({
    mutationKey: keys.delete,
    mutationFn: async (attachments) => {
      const ids = attachments.map(({ id }) => id);
      await deleteAttachments({ path: { orgIdOrSlug }, body: { ids } });
    },

    onMutate: async (attachmentsToDelete) => {
      // Cancel outgoing refetches
      await qc.cancelQueries({ queryKey: keys.list.base });

      // Remove from cache optimistically
      mutateCache.remove(attachmentsToDelete);

      return { deletedAttachments: attachmentsToDelete };
    },

    onError: (_err, _attachments, context) => {
      // Restore deleted attachments on error
      if (context?.deletedAttachments) {
        mutateCache.create(context.deletedAttachments);
      }
    },

    onSettled: () => {
      // Refetch to ensure cache is in sync
      qc.invalidateQueries({ queryKey: keys.list.base });
    },
  });
};
