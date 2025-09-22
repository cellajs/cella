import { useMutation } from '@tanstack/react-query';
import { appConfig } from 'config';
import { t } from 'i18next';
import type { Attachment } from '~/api.gen';
import { createAttachment, deleteAttachments, updateAttachment } from '~/api.gen';
import { LocalFileStorage } from '~/modules/attachments/helpers/local-file-storage';
import { attachmentsKeys } from '~/modules/attachments/query';
import type {
  AttachmentContextProp,
  AttachmentInfiniteQueryData,
  AttachmentQueryData,
  CreateAttachmentParams,
  DeleteAttachmentsParams,
  UpdateAttachmentParams,
} from '~/modules/attachments/types';
import { toaster } from '~/modules/common/toaster/service';
import { queryClient } from '~/query/query-client';
import { getQueryKeySortOrder } from '~/query/utils';
import { compareQueryKeys } from '~/query/utils/compare-query-keys';
import { formatUpdatedCacheData, getQueryItems, getSimilarQueries } from '~/query/utils/mutate-query';
import { nanoid } from '~/utils/nanoid';

const limit = appConfig.requestLimits.attachments;

const handleError = (action: 'create' | 'update' | 'delete' | 'deleteMany', context?: AttachmentContextProp[]) => {
  if (context?.length) {
    for (const [queryKey, previousData] of context) queryClient.setQueryData(queryKey, previousData);
  }

  if (action === 'deleteMany') toaster(t('error:delete_resources', { resources: t('common:attachments') }), 'error');
  else toaster(t(`error:${action}_resource`, { resource: t('common:attachment') }), 'error');
};

export const useAttachmentCreateMutation = () =>
  useMutation<Attachment[], Error, CreateAttachmentParams, AttachmentContextProp[]>({
    mutationKey: attachmentsKeys.create,
    mutationFn: async ({ localCreation, attachments, orgIdOrSlug }) => {
      if (localCreation) {
        console.info('Attachments uploaded locally:', attachments);
        return [];
      }
      return await createAttachment({ body: attachments, path: { orgIdOrSlug } });
    },
    onMutate: async (variables) => {
      const { attachments, orgIdOrSlug } = variables;

      const context: AttachmentContextProp[] = []; // previous query data for rollback if an error occurs
      const optimisticIds: string[] = []; // IDs of optimistically updated items
      const newAttachments: Attachment[] = [];

      // If multiple attachments, create a groupId for optimistically update to associate them.
      // BE will assign final groupId during attachment creation.
      const groupId = attachments.length > 1 ? nanoid() : null;

      for (const { originalKey, convertedKey, thumbnailKey, ...attachment } of attachments) {
        const optimisticId = attachment.id || nanoid();

        // Make newAttachment satisfy Attachment type for optimistic update
        const newAttachment: Attachment = {
          ...attachment,
          url: originalKey,
          thumbnailUrl: thumbnailKey ?? null,
          convertedUrl: convertedKey ?? null,
          convertedContentType: attachment.convertedContentType ?? null,
          public: attachment.public ?? false,
          name: attachment.filename.split('.').slice(0, -1).join('.'),
          id: optimisticId,
          entityType: 'attachment',
          createdAt: new Date().toISOString(),
          createdBy: null,
          modifiedAt: new Date().toISOString(),
          modifiedBy: null,
          groupId,
        };

        newAttachments.push(newAttachment);
        optimisticIds.push(optimisticId);
      }

      // Get affected queries
      const similarKey = attachmentsKeys.list.similarTable({ orgIdOrSlug });
      //Cancel all affected queries
      await queryClient.cancelQueries({ queryKey: similarKey });
      const queries = getSimilarQueries<Attachment>(similarKey);

      // Iterate over affected queries and optimistically update cache
      for (const [queryKey, previousData] of queries) {
        if (!previousData) continue;

        queryClient.setQueryData<AttachmentInfiniteQueryData | AttachmentQueryData>(queryKey, (oldData) => {
          if (!oldData) return oldData;

          const { order: insertOrder } = getQueryKeySortOrder(queryKey);

          // Add new attachments and update total count
          const prevItems = getQueryItems(oldData);
          const updatedItems = insertOrder === 'asc' ? [...prevItems, ...newAttachments] : [...newAttachments, ...prevItems];

          return formatUpdatedCacheData(oldData, updatedItems, limit, newAttachments.length);
        });

        context.push([queryKey, previousData, optimisticIds]); // Store previous data for rollback if needed
      }

      return context;
    },

    onSuccess: async (createdAttachments, { localCreation, orgIdOrSlug }, context) => {
      // Avoid on succusses actions if there was local creation
      if (localCreation) return;

      // Get affected queries
      const similarKey = attachmentsKeys.list.similarTable({ orgIdOrSlug });
      const queries = getSimilarQueries<Attachment>(similarKey);

      for (const query of queries) {
        const [activeKey] = query;

        const { sort, order: insertOrder } = getQueryKeySortOrder(activeKey);

        if ((sort && sort !== 'createdAt') || (sort === 'createdAt' && insertOrder === 'asc')) {
          queryClient.invalidateQueries({ queryKey: activeKey, exact: true });
          continue;
        }

        queryClient.setQueryData<AttachmentInfiniteQueryData | AttachmentQueryData>(activeKey, (oldData) => {
          if (!oldData) return oldData;

          const prevItems = getQueryItems(oldData);

          // Get optimisticIds
          const [_, __, optimisticIds] = context.find(([key]) => compareQueryKeys(key, activeKey)) ?? [];
          const ids = optimisticIds || [];

          // Replace optimistic updates with real server data
          const optimisticAttachments = createdAttachments.filter((el) => ids.includes(el.id));

          const updatedItems = prevItems.map((item) => {
            const createdItem = optimisticAttachments.find((created) => created.id === item.id);
            return createdItem ? { ...item, ...createdItem } : item;
          });

          return formatUpdatedCacheData(oldData, updatedItems, limit); // Already update total in mutate
        });
      }

      const message =
        createdAttachments.length === 1
          ? t('common:success.create_resource', { resource: t('common:attachment') })
          : t('common:success.create_counted_resources', { count: createdAttachments.length, resources: t('common:attachments').toLowerCase() });

      toaster(message, 'success');
    },
    onError: (_, __, context) => handleError('create', context),
  });

export const useAttachmentUpdateMutation = () =>
  useMutation<Attachment, Error, UpdateAttachmentParams, AttachmentContextProp[]>({
    mutationKey: attachmentsKeys.update,
    mutationFn: async ({ id, orgIdOrSlug, ...body }) => {
      return await updateAttachment({ body, path: { id, orgIdOrSlug } });
    },
    onMutate: async (variables: UpdateAttachmentParams) => {
      const { orgIdOrSlug } = variables;

      const context: AttachmentContextProp[] = []; // previous query data for rollback if an error occurs
      const optimisticIds: string[] = []; // IDs of optimistically updated items

      // Get affected queries
      const similarKey = attachmentsKeys.list.similarTable({ orgIdOrSlug });
      //Cancel all affected queries
      await queryClient.cancelQueries({ queryKey: similarKey });
      const queries = getSimilarQueries<Attachment>(similarKey);

      // Iterate over affected queries and optimistically update cache
      for (const [queryKey, previousData] of queries) {
        if (!previousData) continue;

        queryClient.setQueryData<AttachmentInfiniteQueryData | AttachmentQueryData>(queryKey, (oldData) => {
          if (!oldData) return oldData; // Handle missing data

          const prevItems = getQueryItems(oldData);
          const updatedItems = prevItems.map((item) => (item.id === variables.id ? { ...item, ...variables } : item));

          return formatUpdatedCacheData(oldData, updatedItems, limit);
        });

        optimisticIds.push(variables.id); // Track optimistically updated item IDs
        context.push([queryKey, previousData, optimisticIds]); // Store previous data for rollback if needed
      }

      return context;
    },
    onSuccess: async (updatedAttachment, { orgIdOrSlug }, context) => {
      // Get affected queries
      const similarKey = attachmentsKeys.list.similarTable({ orgIdOrSlug });
      const queries = getSimilarQueries<Attachment>(similarKey);

      for (const query of queries) {
        const [activeKey] = query;
        queryClient.setQueryData<AttachmentInfiniteQueryData | AttachmentQueryData>(activeKey, (oldData) => {
          if (!oldData) return oldData;

          const prevItems = getQueryItems(oldData);

          // Get optimisticIds
          const [_, __, optimisticIds] = context.find(([key]) => compareQueryKeys(key, activeKey)) ?? [];
          const ids = optimisticIds || [];

          // Replace optimistic items with the updated attachment
          const updatedAttachments = prevItems.map((item) => (ids.includes(item.id) ? { ...item, ...updatedAttachment } : item));

          return formatUpdatedCacheData(oldData, updatedAttachments);
        });
      }
    },
    onError: (_, __, context) => handleError('update', context),
  });

export const useAttachmentDeleteMutation = () =>
  useMutation<boolean, Error, DeleteAttachmentsParams, AttachmentContextProp[]>({
    mutationKey: attachmentsKeys.delete,
    mutationFn: async ({ localDeletionIds, serverDeletionIds, orgIdOrSlug }) => {
      const localResult = true;
      let serverResult = true;

      if (localDeletionIds.length) await LocalFileStorage.removeFiles(localDeletionIds);

      if (serverDeletionIds.length) {
        const response = await deleteAttachments({ body: { ids: serverDeletionIds }, path: { orgIdOrSlug } });
        serverResult = response.success;
      }

      return localResult && serverResult;
    },
    onMutate: async (variables) => {
      const { localDeletionIds, serverDeletionIds, orgIdOrSlug } = variables;

      const ids = [...localDeletionIds, ...serverDeletionIds];

      const context: AttachmentContextProp[] = []; // previous query data for rollback if an error occurs

      // Get affected queries
      const similarKey = attachmentsKeys.list.similarTable({ orgIdOrSlug });
      //Cancel all affected queries
      await queryClient.cancelQueries({ queryKey: similarKey });
      const queries = getSimilarQueries<Attachment>(similarKey);

      // Iterate over affected queries and optimistically update cache
      for (const [queryKey, previousData] of queries) {
        if (!previousData) continue;

        queryClient.setQueryData<AttachmentInfiniteQueryData | AttachmentQueryData>(queryKey, (oldData) => {
          if (!oldData) return oldData;

          const prevItems = getQueryItems(oldData);
          const updatedItems = prevItems.filter((item) => !ids.includes(item.id));

          return formatUpdatedCacheData(oldData, updatedItems, limit, -ids.length);
        });

        context.push([queryKey, previousData]); // Store previous data for potential rollback
      }

      return context;
    },
    onError: (_, { serverDeletionIds }, context) => handleError(serverDeletionIds.length > 1 ? 'deleteMany' : 'delete', context),
  });
