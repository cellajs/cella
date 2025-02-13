import { useMutation } from '@tanstack/react-query';
import { config } from 'config';
import { t } from 'i18next';
import { toast } from 'sonner';
import { queryClient } from '~/lib/router';
import {
  type CreateAttachmentParams,
  type DeleteAttachmentsParams,
  type UpdateAttachmentParams,
  createAttachments,
  deleteAttachments,
  updateAttachment,
} from '~/modules/attachments/api';
import { attachmentsKeys } from '~/modules/attachments/query';
import type { Attachment } from '~/modules/attachments/types';
import { toaster } from '~/modules/common/toaster';
import { compareQueryKeys } from '~/query/helpers/compare-query-keys';
import { formatUpdatedData, getCancelingRefetchQueries, getQueries, getQueryItems, handleNoOldData } from '~/query/helpers/mutate-query';
import type { ContextProp, InfiniteQueryData, QueryData } from '~/query/types';
import { nanoid } from '~/utils/nanoid';

type AttachmentQueryData = QueryData<Attachment>;
export type AttachmentInfiniteQueryData = InfiniteQueryData<Attachment>;
type AttachmentContextProp = ContextProp<Attachment, string[] | null>;

const limit = config.requestLimits.attachments;

export const useAttachmentCreateMutation = () =>
  useMutation<Attachment[], Error, CreateAttachmentParams>({
    mutationKey: attachmentsKeys.create(),
    mutationFn: createAttachments,
  });

export const useAttachmentUpdateMutation = () =>
  useMutation<Attachment, Error, UpdateAttachmentParams>({
    mutationKey: attachmentsKeys.update(),
    mutationFn: updateAttachment,
  });

export const useAttachmentDeleteMutation = () =>
  useMutation<boolean, Error, DeleteAttachmentsParams>({
    mutationKey: attachmentsKeys.delete(),
    mutationFn: deleteAttachments,
  });

const handleError = (action: 'create' | 'update' | 'delete' | 'deleteMany', context?: AttachmentContextProp[]) => {
  if (context?.length) {
    for (const [queryKey, previousData] of context) queryClient.setQueryData(queryKey, previousData);
  }

  if (action === 'deleteMany') toast.error(t('error:delete_resources', { resource: t('common:attachments') }));
  else toast.error(t(`error:${action}_resource`, { resource: t('common:attachment') }));
};

queryClient.setMutationDefaults(attachmentsKeys.create(), {
  mutationFn: createAttachments,
  onMutate: async (variables) => {
    const { attachments, orgIdOrSlug } = variables;

    const context: AttachmentContextProp[] = []; // previous query data for rollback if an error occurs
    const optimisticIds: string[] = []; // IDs of optimistically updated items
    const newAttachments: Attachment[] = [];

    for (const attachment of attachments) {
      const optimisticId = attachment.id || nanoid();

      // Make newAttachment satisfied Attachment type for optimistic update
      const newAttachment: Attachment = {
        ...attachment,
        name: attachment.filename.split('.').slice(0, -1).join('.'),
        id: optimisticId,
        entity: 'attachment',
        createdAt: new Date().toISOString(),
        createdBy: null,
        modifiedAt: new Date().toISOString(),
        modifiedBy: null,
      };

      newAttachments.push(newAttachment);
      optimisticIds.push(optimisticId);
    }

    // Get affected queries
    const exactKey = attachmentsKeys.table({ orgIdOrSlug });
    const similarKey = attachmentsKeys.similar({ orgIdOrSlug });
    const queries = await getCancelingRefetchQueries<Attachment>(exactKey, similarKey);

    // Iterate over affected queries and optimistically update cache
    for (const [queryKey, previousData] of queries) {
      if (!previousData) continue;

      queryClient.setQueryData<AttachmentInfiniteQueryData | AttachmentQueryData>(queryKey, (oldData) => {
        if (!oldData) return handleNoOldData(oldData); // Handle missing data

        const prevItems = getQueryItems(oldData);
        const updatedItems = [...newAttachments, ...prevItems];

        return formatUpdatedData(oldData, updatedItems, limit, newAttachments.length);
      });

      context.push([queryKey, previousData, optimisticIds]); // Store previous data for rollback if needed
    }

    return context;
  },

  onSuccess: (createdAttachments, { orgIdOrSlug }, context) => {
    const exactKey = attachmentsKeys.table({ orgIdOrSlug });
    const similarKey = attachmentsKeys.similar({ orgIdOrSlug });

    const queries = getQueries<Attachment>(exactKey, similarKey);

    for (const query of queries) {
      const [activeKey] = query;

      queryClient.setQueryData<AttachmentInfiniteQueryData | AttachmentQueryData>(activeKey, (oldData) => {
        if (!oldData) return handleNoOldData(oldData);

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

        return formatUpdatedData(oldData, updatedItems, limit); // Already update total in mutate
      });
    }
    toast.success(t('common:success.create_resources', { resources: t('common:attachments') }));
  },
  onError: (_, __, context) => handleError('create', context),
});

queryClient.setMutationDefaults(attachmentsKeys.update(), {
  mutationFn: updateAttachment,
  onMutate: async (variables: UpdateAttachmentParams) => {
    const { orgIdOrSlug } = variables;

    const context: AttachmentContextProp[] = []; // previous query data for rollback if an error occurs
    const optimisticIds: string[] = []; // IDs of optimistically updated items

    // Get affected queries
    const exactKey = attachmentsKeys.table({ orgIdOrSlug });
    const similarKey = attachmentsKeys.similar({ orgIdOrSlug });
    const queries = await getCancelingRefetchQueries<Attachment>(exactKey, similarKey);

    // Iterate over affected queries and optimistically update cache
    for (const [queryKey, previousData] of queries) {
      if (!previousData) continue;

      queryClient.setQueryData<AttachmentInfiniteQueryData | AttachmentQueryData>(queryKey, (oldData) => {
        if (!oldData) return handleNoOldData(oldData); // Handle missing data

        const prevItems = getQueryItems(oldData);
        const updatedItems = prevItems.map((item) => (item.id === variables.id ? { ...item, ...variables } : item));

        return formatUpdatedData(oldData, updatedItems, limit);
      });

      optimisticIds.push(variables.id); // Track optimistically updated item IDs
      context.push([queryKey, previousData, optimisticIds]); // Store previous data for rollback if needed
    }

    return context;
  },
  onSuccess: async (updatedAttachment, { orgIdOrSlug }, context) => {
    // Get affected queries
    const exactKey = attachmentsKeys.table({ orgIdOrSlug });
    const similarKey = attachmentsKeys.similar({ orgIdOrSlug });
    const queries = getQueries<Attachment>(exactKey, similarKey);

    for (const query of queries) {
      const [activeKey] = query;
      queryClient.setQueryData<AttachmentInfiniteQueryData | AttachmentQueryData>(activeKey, (oldData) => {
        if (!oldData) return handleNoOldData(oldData); // Handle no old data

        const prevItems = getQueryItems(oldData);

        // Get optimisticIds
        const [_, __, optimisticIds] = context.find(([key]) => compareQueryKeys(key, activeKey)) ?? [];
        const ids = optimisticIds || [];

        // Replace optimistic items with the updated attachment
        const updatedAttachments = prevItems.map((item) => (ids.includes(item.id) ? { ...item, ...updatedAttachment } : item));

        return formatUpdatedData(oldData, updatedAttachments);
      });
    }
  },
  onError: (_, __, context) => handleError('update', context),
});

queryClient.setMutationDefaults(attachmentsKeys.delete(), {
  mutationFn: deleteAttachments,
  onMutate: async (variables) => {
    const { ids, orgIdOrSlug } = variables;

    const context: AttachmentContextProp[] = []; // previous query data for rollback if an error occurs

    // Get affected queries
    const exactKey = attachmentsKeys.table({ orgIdOrSlug });
    const similarKey = attachmentsKeys.similar({ orgIdOrSlug });
    const queries = await getCancelingRefetchQueries<Attachment>(exactKey, similarKey);

    // Iterate over affected queries and optimistically update cache
    for (const [queryKey, previousData] of queries) {
      if (!previousData) continue;

      queryClient.setQueryData<AttachmentInfiniteQueryData | AttachmentQueryData>(queryKey, (oldData) => {
        if (!oldData) return handleNoOldData(oldData); // Handle case where old data is missing

        const prevItems = getQueryItems(oldData);
        const updatedItems = prevItems.filter((item) => !ids.includes(item.id));

        return formatUpdatedData(oldData, updatedItems, limit, -ids.length);
      });

      context.push([queryKey, previousData, null]); // Store previous data for potential rollback
    }

    return context;
  },
  onSuccess: () => toaster(t('common:success.delete_resources', { resources: t('common:attachments') }), 'success'),
  onError: (_, { ids }, context) => handleError(ids.length > 1 ? 'deleteMany' : 'delete', context),
});
